import {type SanityClient} from '@sanity/client'

import type {StoreActionContext} from '../../../store/createStore'
import type {ClientOptions, ClientState} from '../clientStore'

/**
 * Retrieves a memoized client based on the API version,
 * or creates a new one if it doesn't exist.
 * @internal
 */
export const getOrCreateClient = (
  {store}: StoreActionContext<ClientState>,
  options: ClientOptions = {},
): SanityClient => {
  const state = store.getState()
  const {apiVersion} = options

  if (!apiVersion) {
    throw new Error('Missing required `apiVersion` option')
  }

  const cached = state.clients.get(apiVersion)
  if (cached) {
    return cached
  }

  // Create new client with specified API version
  const client = state.defaultClient.withConfig(options)

  // Update state with new client
  store.setState((prevState) => {
    const newMap = new Map(prevState.clients)
    newMap.set(apiVersion, client)
    return {
      ...prevState,
      clients: newMap,
    }
  })

  return client
}
