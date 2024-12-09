import type {SanityClient} from '@sanity/client'

import type {SanityInstance} from '../instance/types'
import {type ClientOptions, getClientStore} from './store/clientStore'

/**
 * Retrieve a memoized client based on the apiVersion.
 * @public
 */
export const getClient = (options: ClientOptions, instance: SanityInstance): SanityClient => {
  const clientStore = getClientStore(instance)
  return clientStore.getOrCreateClient(options)
}
