import {bindActionGlobally} from '../store/createActionBinder'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {AuthStateType} from './authStateType'
import {authStore} from './authStore'

/**
 * @public
 */
export const logout = bindActionGlobally(authStore, async ({state}) => {
  const {clientFactory, apiHost, providedToken, storageArea, storageKey} = state.get().options

  // If a token is statically provided, logout does nothing
  if (providedToken) return

  const {authState} = state.get()

  // If we already have an inflight request, no-op
  if (authState.type === AuthStateType.LOGGED_OUT && authState.isDestroyingSession) return
  const token = authState.type === AuthStateType.LOGGED_IN && authState.token

  try {
    if (token) {
      state.set('loggingOut', {
        authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: true},
      })

      const client = clientFactory({
        token,
        requestTagPrefix: REQUEST_TAG_PREFIX,
        apiVersion: DEFAULT_API_VERSION,
        ...(apiHost && {apiHost}),
        useProjectHostname: false,
      })

      await client.request<void>({uri: '/auth/logout', method: 'POST'})
    }
  } finally {
    state.set('logoutSuccess', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    })
    storageArea?.removeItem(storageKey)
  }
})
