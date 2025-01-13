import type {AuthProvider} from '@sanity/client'

import {createAction} from '../resources/createAction'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {authStore} from './authStore'
import {getDefaultLocation} from './utils'

/**
 * @public
 */
export const fetchLoginUrls = createAction(authStore, ({state, instance}) => {
  const {projectId, dataset} = instance.identity
  const {callbackUrl, clientFactory, apiHost, authScope, customProviders} = state.get().options
  const client = clientFactory({
    projectId,
    dataset,
    apiVersion: DEFAULT_API_VERSION,
    requestTagPrefix: REQUEST_TAG_PREFIX,
    useProjectHostname: authScope === 'project',
    ...(apiHost && {apiHost}),
  })

  return async function () {
    const cachedProviders = state.get().providers
    if (cachedProviders) return cachedProviders

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
      const origin = new URL(
        callbackUrl
          ? new URL(callbackUrl, new URL(getDefaultLocation()).origin).toString()
          : getDefaultLocation(),
      )

      // `getDefaultLocation()` may be populated with an `sid` from a previous
      // failed login attempt and should be omitted from the next login URL
      const hashParams = new URLSearchParams(origin.hash.slice(1))
      hashParams.delete('sid')
      origin.hash = hashParams.toString()

      // similarly, the origin may be populated with an `error` query param if
      // the auth provider redirects back to the application. this should also
      // be omitted from the origin sent
      origin.searchParams.delete('error')

      url.searchParams.set('origin', origin.toString())
      url.searchParams.set('withSid', 'true')
      if (authScope === 'project') {
        url.searchParams.set('projectId', projectId)
      }

      return {...provider, url: url.toString()}
    })

    state.set('fetchedLoginUrls', {providers: configuredProviders})

    return configuredProviders
  }
})
