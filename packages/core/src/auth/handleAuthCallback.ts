import {bindActionGlobally} from '../store/createActionBinder'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {AuthStateType} from './authStateType'
import {authStore, type AuthStoreState, type DashboardContext} from './authStore'
import {getAuthCode, getDefaultLocation} from './utils'

/**
 * @public
 */
export const handleAuthCallback = bindActionGlobally(
  authStore,
  async ({state}, locationHref: string = getDefaultLocation()) => {
    const {providedToken, callbackUrl, clientFactory, apiHost, storageArea, storageKey} =
      state.get().options

    // If a token is provided, no need to handle callback
    if (providedToken) return false

    // Don't handle the callback if already in flight.
    const {authState} = state.get()
    if (authState.type === AuthStateType.LOGGING_IN && authState.isExchangingToken) return false

    // If there is no matching `authCode` then we can't handle the callback
    const authCode = getAuthCode(callbackUrl, locationHref)
    if (!authCode) return false

    // Get the SanityOS dashboard context from the url
    const parsedUrl = new URL(locationHref)
    let dashboardContext: DashboardContext = {}
    try {
      const contextParam = parsedUrl.searchParams.get('_context') ?? '{}'
      dashboardContext = JSON.parse(contextParam)
    } catch (err) {
      // If JSON parsing fails, use empty context
      // eslint-disable-next-line no-console
      console.error('Failed to parse dashboard context:', err)
    }
    const {mode, env, orgId} = dashboardContext

    // Otherwise, start the exchange
    state.set('exchangeSessionForToken', {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: true},
      dashboardContext: {mode, env, orgId},
    } as Partial<AuthStoreState>)

    try {
      const client = clientFactory({
        apiVersion: DEFAULT_API_VERSION,
        requestTagPrefix: REQUEST_TAG_PREFIX,
        useProjectHostname: false,
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
      loc.searchParams.delete('sid')
      loc.searchParams.delete('url')
      return loc.toString()
    } catch (error) {
      state.set('exchangeSessionForTokenError', {authState: {type: AuthStateType.ERROR, error}})
      return false
    }
  },
)
