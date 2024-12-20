import {createAction} from '../resources/createAction'
import {AuthStateType, DEFAULT_API_VERSION, getAuthStore, REQUEST_TAG_PREFIX} from './authStore'
import {getAuthCode, getDefaultLocation} from './utils'

/**
 * @public
 */
export const handleCallback = createAction(getAuthStore, ({state, instance}) => {
  const {projectId, dataset} = instance.identity
  const {providedToken, callbackUrl, clientFactory, apiHost, authScope, storageArea, storageKey} =
    state.get().options

  return async function (locationHref: string = getDefaultLocation()) {
    // If a token is provided, no need to handle callback
    if (providedToken) return false

    // Don't handle the callback if already in flight.
    const {authState} = state.get()
    if (authState.type === AuthStateType.LOGGING_IN && authState.isExchangingToken) return false

    // If there is no matching `authCode` then we can't handle the callback
    const authCode = getAuthCode(callbackUrl, locationHref)
    if (!authCode) return false

    // Otherwise, start the exchange
    state.set('exchangeSessionForToken', {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: true},
    })

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
      state.set('setToken', {authState: {type: AuthStateType.LOGGED_IN, token, currentUser: null}})

      const loc = new URL(locationHref)
      loc.hash = ''
      return loc.toString()
    } catch (error) {
      state.set('exchangeSessionForTokenError', {authState: {type: AuthStateType.ERROR, error}})
      return false
    }
  }
})
