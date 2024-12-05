import {type SanityClient} from '@sanity/client'

import type {StoreActionContext} from '../../../store/createStore'
import type {ClientOptions, ClientState} from '../clientStore'

/**
 *
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
  store.setState((state) => {
    const newMap = new Map(state.clients)
    newMap.set(apiVersion, client)
    return {
      ...state,
      clients: newMap,
    }
  })

  return client
}
