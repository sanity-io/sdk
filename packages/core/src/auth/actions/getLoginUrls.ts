import {createResourceAction} from '../../store/createResource'
import type {AuthProvider} from '../authStore'
import {Auth} from '../newAuthStore'

const DEFAULT_API_VERSION = '2021-06-07'
const REQUEST_TAG_PREFIX = 'sdk.auth'

export const getLoginUrls = createResourceAction(Auth, ({context, instance, state}) => {
  const {projectId, dataset} = instance.identity
  const {clientFactory, apiHost, authScope, customProviders, callbackUrl, getDefaultLocation} =
    context
  /**
   * Fetches the providers from `/auth/providers`, adds params to each url, and
   * caches the result for synchronous usage.
   */
  async function fetchLoginUrls(): Promise<AuthProvider[]> {
    const client = clientFactory({
      projectId,
      dataset,
      apiVersion: DEFAULT_API_VERSION,
      requestTagPrefix: REQUEST_TAG_PREFIX,
      useProjectHostname: authScope === 'project',
      ...(apiHost && {apiHost}),
    })

    const {providers: defaultProviders} = await client.request<{providers: AuthProvider[]}>({
      uri: '/auth/providers',
      tag: 'fetch-providers',
    })

    let providers: AuthProvider[]

    if (typeof customProviders === 'function') {
      providers = await customProviders(defaultProviders)
    } else if (!customProviders?.length) {
      providers = defaultProviders
    } else {
      const customProviderUrls = new Set(customProviders.map((p) => p.url))
      providers = defaultProviders
        .filter((official) => !customProviderUrls.has(official.url))
        .concat(customProviders)
    }

    const configuredProviders = providers.map((provider) => {
      const url = new URL(provider.url)
      const origin = callbackUrl
        ? new URL(callbackUrl, new URL(getDefaultLocation()).origin).toString()
        : getDefaultLocation()

      url.searchParams.set('origin', origin)
      url.searchParams.set('withSid', 'true')
      if (authScope === 'project') {
        url.searchParams.set('projectId', projectId)
      }

      return {...provider, url: url.toString()}
    })

    state.set('fetchedLoginUrls', {providers: configuredProviders})

    return configuredProviders
  }

  function getLoginUrls() {
    const {providers: cachedProviders} = state.get()
    if (cachedProviders) return cachedProviders

    return fetchLoginUrls()
  }

  return getLoginUrls
})
