import {createResourceAction} from '../../store/createResource'
import {Auth} from '../newAuthStore'

const DEFAULT_API_VERSION = '2021-06-07'
const REQUEST_TAG_PREFIX = 'sdk.auth'

export const logout = createResourceAction(Auth, ({context, state, instance}) => {
  const {projectId, dataset} = instance.identity
  const {providedToken, clientFactory, authScope, apiHost, storageArea, storageKey} = context

  return async () => {
    // If a token is statically provided, logout does nothing
    if (providedToken) return

    const {authState} = state.get()

    // If we already have an inflight request, no-op
    if (authState.type === 'logged-out' && authState.isDestroyingSession) return
    const token = authState.type === 'logged-in' && authState.token

    try {
      if (token) {
        state.set('loggingOut', {authState: {type: 'logged-out', isDestroyingSession: true}})

        const client = clientFactory({
          token,
          projectId,
          dataset,
          requestTagPrefix: REQUEST_TAG_PREFIX,
          apiVersion: DEFAULT_API_VERSION,
          useProjectHostname: authScope === 'project',
          ...(apiHost && {apiHost}),
        })

        await client.request<void>({uri: '/auth/logout', method: 'POST'})
      }
    } finally {
      state.set('logoutSuccess', {authState: {type: 'logged-out', isDestroyingSession: false}})

      storageArea?.removeItem(storageKey)
    }
  }
})
