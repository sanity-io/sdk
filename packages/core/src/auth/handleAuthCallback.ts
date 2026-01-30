import {bindActionGlobally} from '../store/createActionBinder'
import {createLogger} from '../utils/logger'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {AuthStateType} from './authStateType'
import {authStore, type AuthStoreState, type DashboardContext} from './authStore'
import {getAuthCode, getCleanedUrl, getDefaultLocation, getTokenFromLocation} from './utils'

/**
 * @public
 */
export const handleAuthCallback = bindActionGlobally(
  authStore,
  async ({state, instance}, locationHref: string = getDefaultLocation()) => {
    const logger = createLogger('auth', {
      instanceId: instance.instanceId,
      projectId: instance.config.projectId,
      dataset: instance.config.dataset,
    })

    const {providedToken, callbackUrl, clientFactory, apiHost, storageArea, storageKey} =
      state.get().options

    // If a token is provided, no need to handle callback
    if (providedToken) {
      logger.debug('Skipping auth callback - token already provided')
      return false
    }

    // Don't handle the callback if already in flight.
    const {authState} = state.get()
    if (authState.type === AuthStateType.LOGGING_IN && authState.isExchangingToken) {
      logger.debug('Skipping auth callback - token exchange already in progress')
      return false
    }

    // Prepare the cleaned-up URL early. It will be returned on both success and error if an authCode/token was processed.
    const cleanedUrl = getCleanedUrl(locationHref)

    // Check if there is a token in the is in the Dashboard iframe url hash
    const tokenFromUrl = getTokenFromLocation(locationHref)
    if (tokenFromUrl) {
      logger.info('Auth token found in URL, logging in')
      state.set('setTokenFromUrl', {
        authState: {type: AuthStateType.LOGGED_IN, token: tokenFromUrl, currentUser: null},
      })
      return cleanedUrl
    }

    // If there is no matching `authCode` then we can't handle the callback
    const authCode = getAuthCode(callbackUrl, locationHref)
    if (!authCode) {
      logger.debug('No auth code found in callback URL')
      return false
    }

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
          logger.debug('Dashboard context parsed from callback URL', {
            hasDashboardContext: true,
          })
        }
      }
    } catch (err) {
      // If JSON parsing fails, use empty context
      logger.warn('Failed to parse dashboard context from callback URL', {error: err})
    }

    // Otherwise, start the exchange
    logger.info('Exchanging auth code for token')
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

      logger.debug('Fetching token from auth endpoint')
      const {token} = await client.request<{token: string; label: string}>({
        method: 'GET',
        uri: '/auth/fetch',
        query: {sid: authCode},
        tag: 'fetch-token',
      })

      logger.info('Auth token obtained successfully, user logged in')
      storageArea?.setItem(storageKey, JSON.stringify({token}))
      state.set('setToken', {authState: {type: AuthStateType.LOGGED_IN, token, currentUser: null}})

      return cleanedUrl
    } catch (error) {
      logger.error('Failed to exchange auth code for token', {error})
      state.set('exchangeSessionForTokenError', {authState: {type: AuthStateType.ERROR, error}})
      return cleanedUrl
    }
  },
)
