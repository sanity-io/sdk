import {bindActionGlobally} from '../store/createActionBinder'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {getAuthLogger} from './authLogger'
import {AuthStateType} from './authStateType'
import {authStore} from './authStore'
import {revokeOAuthTokens} from './oauth/oauthActions'

/**
 * Logs the current user out. In OAuth mode this revokes the OAuth tokens
 * instead of calling the legacy `/auth/logout` endpoint; revocation is
 * best-effort, so the OAuth path resolves even if the revoke request fails,
 * whereas the legacy path rejects when `/auth/logout` fails. Local state and
 * storage are cleared in both cases.
 *
 * @public
 */
export const logout = bindActionGlobally(authStore, async ({state, instance}) => {
  const logger = getAuthLogger(instance)

  const {clientFactory, apiHost, providedToken, storageArea, storageKey, oauth} =
    state.get().options

  // If a token is statically provided, logout does nothing
  if (providedToken) {
    logger.debug('Skipping logout - token is statically provided')
    return
  }

  const {authState} = state.get()

  // If we already have an inflight request, no-op
  if (authState.type === AuthStateType.LOGGED_OUT && authState.isDestroyingSession) {
    logger.debug('Skipping logout - already in progress')
    return
  }

  if (oauth) {
    logger.debug('OAuth mode - revoking tokens instead of calling /auth/logout')
    state.set('loggingOut', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: true},
    })
    await revokeOAuthTokens(instance)
    return
  }
  const token = authState.type === AuthStateType.LOGGED_IN && authState.token

  try {
    if (token) {
      logger.info('Logging out user')
      state.set('loggingOut', {
        authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: true},
      })

      const client = clientFactory({
        token,
        requestTagPrefix: REQUEST_TAG_PREFIX,
        apiVersion: DEFAULT_API_VERSION,
        ...(apiHost && {apiHost}),
        useProjectHostname: false,
        useCdn: false,
      })

      logger.debug('Calling logout endpoint')
      await client.request<void>({url: '/auth/logout', method: 'POST', tag: 'logout'})
    } else {
      logger.debug('No token to logout - already logged out')
    }
  } catch (error) {
    // Re-throw to preserve the existing contract: logout rejects when the
    // request fails. Local state is still cleared in the finally block.
    logger.error('Logout request failed', {error})
    throw error
  } finally {
    logger.info('User logged out, clearing stored tokens')
    state.set('logoutSuccess', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
      oauthTokens: undefined,
    })
    storageArea?.removeItem(storageKey)
    storageArea?.removeItem(`${storageKey}_last_refresh`)
  }
})
