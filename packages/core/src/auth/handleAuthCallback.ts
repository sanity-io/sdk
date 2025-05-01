import {bindActionGlobally} from '../store/createActionBinder'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {AuthStateType} from './authStateType'
import {authStore, type AuthStoreState, type DashboardContext} from './authStore'
import {getAuthCode, getCleanedUrl, getDefaultLocation, getTokenFromLocation} from './utils'

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

    // Prepare the cleaned-up URL early. It will be returned on both success and error if an authCode/token was processed.
    const cleanedUrl = getCleanedUrl(locationHref)

    // Check if there is a token in the is in the Dashboard iframe url hash
    const tokenFromUrl = getTokenFromLocation(locationHref)
    if (tokenFromUrl) {
      state.set('setTokenFromUrl', {
        authState: {type: AuthStateType.LOGGED_IN, token: tokenFromUrl, currentUser: null},
      })
      return cleanedUrl
    }

    // If there is no matching `authCode` then we can't handle the callback
    const authCode = getAuthCode(callbackUrl, locationHref)
    if (!authCode) return false

    // Get the SanityOS dashboard context from the url
    const parsedUrl = new URL(locationHref)
    let dashboardContext: DashboardContext = {}
    try {
      const contextParam = parsedUrl.searchParams.get('_context')
      if (contextParam) {
        const parsedContext = JSON.parse(contextParam)
        if (parsedContext && typeof parsedContext === 'object') {
          delete parsedContext.sid
          dashboardContext = parsedContext
        }
      }
    } catch (err) {
      // If JSON parsing fails, use empty context
      // eslint-disable-next-line no-console
      console.error('Failed to parse dashboard context:', err)
    }

    // Otherwise, start the exchange
    state.set('exchangeSessionForToken', {
      authState: {type: AuthStateType.LOGGING_IN, isExchangingToken: true},
      dashboardContext,
    } as Partial<AuthStoreState>)

    try {
      const client = clientFactory({
        apiVersion: DEFAULT_API_VERSION,
        requestTagPrefix: REQUEST_TAG_PREFIX,
        useProjectHostname: false,
        useCdn: false,
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

      return cleanedUrl
    } catch (error) {
      state.set('exchangeSessionForTokenError', {authState: {type: AuthStateType.ERROR, error}})
      return cleanedUrl
    }
  },
)
