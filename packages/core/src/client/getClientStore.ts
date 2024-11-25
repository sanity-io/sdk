import {createClient} from '@sanity/client'

import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {type ClientStore, createClientStore} from './clientStore'

export const DEFAULT_API_VERSION = 'v2024-11-12'

/** @internal */
export const getClientStore = (instance: SanityInstance): ClientStore => {
  const clientStore = getOrCreateResource(instance, 'clientStore', () => {
    const {config, identity} = instance
    const client = createClient({
      ...(identity.projectId ? {projectId: identity.projectId} : {}),
      dataset: identity.dataset,
      token: config.token,
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
