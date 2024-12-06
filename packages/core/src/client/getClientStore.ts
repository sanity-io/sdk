import {createClient} from '@sanity/client'

import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {type ClientStore, createClientStore} from './clientStore'

export const DEFAULT_API_VERSION = 'v2024-11-12'

/**
 * This is an internal function that retrieves a client store.
 * @internal
 */
export const getClientStore = (instance: SanityInstance): ClientStore => {
  const clientStore = getOrCreateResource(instance, 'clientStore', () => {
    const {identity} = instance
    const client = createClient({
      ...(identity.projectId ? {projectId: identity.projectId} : {}),
      dataset: identity.dataset,
      useCdn: false,
      apiVersion: DEFAULT_API_VERSION,
      ...(identity.projectId
        ? {}
        : {
            withCredentials: false,
            useProjectHostname: false,
            ignoreBrowserTokenWarning: true,
          }),
    })
    return createClientStore(client)
  })

  return clientStore
}
