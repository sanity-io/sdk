import {bindActionGlobally} from '../store/createActionBinder'
import {createLogger} from '../utils/logger'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {AuthStateType} from './authStateType'
import {authStore} from './authStore'

/**
 * @public
 */
export const logout = bindActionGlobally(authStore, async ({state, instance}) => {
  const logger = createLogger('auth', {
    instanceId: instance.instanceId,
    projectId: instance.config.projectId,
    dataset: instance.config.dataset,
  })

  const {clientFactory, apiHost, providedToken, storageArea, storageKey} = state.get().options

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
      await client.request<void>({uri: '/auth/logout', method: 'POST'})
    } else {
      logger.debug('No token to logout - already logged out')
    }
  } catch (error) {
    logger.error('Logout request failed', {error})
    throw error
  } finally {
    logger.info('User logged out, clearing stored tokens')
    state.set('logoutSuccess', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    })
    storageArea?.removeItem(storageKey)
    storageArea?.removeItem(`${storageKey}_last_refresh`)
  }
})
