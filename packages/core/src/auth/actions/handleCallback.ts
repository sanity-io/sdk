import {createResourceAction} from '../../store/createResource'
import {Auth} from '../newAuthStore'
import {getAuthCode} from './getAuthCode'

const DEFAULT_API_VERSION = '2021-06-07'
const REQUEST_TAG_PREFIX = 'sdk.auth'

export const handleCallback = createResourceAction(Auth, ({instance, context, state}) => {
  const {
    getDefaultLocation,
    providedToken,
    clientFactory,
    apiHost,
    authScope,
    storageArea,
    storageKey,
  } = context
  const {projectId, dataset} = instance.identity

  return async function handleCallback(locationHref: string = getDefaultLocation()) {
    // If a token is provided, no need to handle callback
    if (providedToken) return false

    // Don't handle the callback if already in flight.
    const {authState} = state.get()
    if (authState.type === 'logging-in' && authState.isExchangingToken) return false

    // If there is no matching `authCode` then we can't handle the callback
    const authCode = getAuthCode(instance, locationHref)
    if (!authCode) return false

    // Otherwise, start the exchange
    state.set('exchangeSessionForToken', {authState: {type: 'logging-in', isExchangingToken: true}})

    try {
      const client = clientFactory({
        projectId,
        dataset,
        apiVersion: DEFAULT_API_VERSION,
        requestTagPrefix: REQUEST_TAG_PREFIX,
        useProjectHostname: authScope === 'project',
        ...(apiHost && {apiHost}),
      })

      const {token} = await client.request<{token: string; label: string}>({
        method: 'GET',
        uri: '/auth/fetch',
        query: {sid: authCode},
        tag: 'fetch-token',
      })

      storageArea?.setItem(storageKey, JSON.stringify({token}))
      state.set('exchangeSessionForTokenSuccess', {
        authState: {type: 'logged-in', token, currentUser: null},
      })

      const loc = new URL(locationHref)
      loc.hash = ''
      return loc.toString()
    } catch (error) {
      state.set('exchangeSessionForTokenError', {authState: {type: 'error', error}})
      return false
    }
  }
})
