import {type SanityClient} from '@sanity/client'

import {createAction} from '../../resources/createAction'
import {clientStore} from '../clientStore'

/**
 * Options used when retrieving a client via getOrCreateClient.
 * @public
 */
export interface ClientOptions {
  apiVersion?: string
}

/**
 * Retrieves a memoized client based on the API version,
 * or creates a new one if it doesn't exist.
 * @public
 */
export const getClient = createAction(
  () => clientStore,
  ({state}) => {
    return (options: ClientOptions = {}): SanityClient => {
      const {apiVersion} = options

      if (!apiVersion) {
        throw new Error('Missing required `apiVersion` option')
      }

      const cached = state.get().clients.get(apiVersion)
      if (cached) {
        return cached
      }

      // Create new client with specified API version
      const client = state.get().defaultClient.withConfig(options)
      const newMap = new Map(state.get().clients)
      newMap.set(apiVersion, client)

      // Update state with new client
      state.set('createClient', {
        clients: newMap,
      })

      return client
    }
  },
)
