import {createClient} from '@sanity/client'

import {storesKey} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {type ClientStore, createClientStore} from './clientStore'

export const DEFAULT_API_VERSION = 'v2024-11-12'

/** @internal */
export const getClientStore = (instance: SanityInstance): ClientStore => {
  if (!instance[storesKey]) {
    // Initialize stores if somehow not present
    instance[storesKey] = {}
  }

  const stores = instance[storesKey]

  if (!stores.clientStore) {
    const {projectId, dataset, token} = instance.config
    const client = createClient({
      projectId,
      dataset,
      token,
      useCdn: false,
      apiVersion: DEFAULT_API_VERSION,
    })
    stores.clientStore = createClientStore(client)
  }

  return stores.clientStore
}
