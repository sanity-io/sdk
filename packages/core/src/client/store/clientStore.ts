import {createClient, type SanityClient} from '@sanity/client'
import type {Subscribable} from 'rxjs'

import {getInternalAuthStore} from '../../auth/getInternalAuthStore'
import {getOrCreateResource} from '../../instance/sanityInstance'
import type {SanityInstance} from '../../instance/types'
import {createStore} from '../../store/createStore'
import {getClientEvents} from './actions/getClientEvents'
import {getOrCreateClient} from './actions/getOrCreateClient'
import {receiveToken} from './actions/receiveToken'

export const DEFAULT_API_VERSION = 'v2024-11-12'

/**
 * Options used when retrieving a client via getOrCreateClient.
 * @public
 */
export interface ClientOptions {
  apiVersion?: string
}

/**
 * Internal state of the client store.
 * @internal
 */
export interface ClientState {
  // default client shouldn't be exposed, but is used in creation of new clients
  defaultClient: SanityClient
  clients: Map<string, SanityClient>
}

/**
 * Collection of actions to retrieve or create clients.
 * @internal
 */
export interface ClientStore {
  getOrCreateClient: (options: ClientOptions) => SanityClient
  receiveToken: (token: string | undefined) => void
  getClientEvents: (options: ClientOptions) => Subscribable<SanityClient>
}

const createInitialState = (defaultClient: SanityClient): ClientState => {
  const clients = new Map<string, SanityClient>()
  clients.set(defaultClient.config().apiVersion, defaultClient)
  return {defaultClient, clients}
}

const clientStoreActions = {
  getOrCreateClient,
  receiveToken,
  getClientEvents,
}

/**
 * Construction method for creating a client store, including subscribing to auth store.
 * @internal
 */
export const createClientStore = (
  instance: SanityInstance,
  defaultClient: SanityClient,
): ClientStore => {
  const internalAuthStore = getInternalAuthStore(instance)

  const store = createStore(createInitialState(defaultClient), clientStoreActions, {
    name: 'clientStore',
    instance,
  })

  // Initialize the client store with the current auth state
  const internalState = internalAuthStore.getState()
  if (internalState.authState.type === 'logged-in') {
    store.receiveToken(internalState.authState.token)
  }

  internalAuthStore.subscribe((state, prevState) => {
    if (state.authState.type === 'logged-in' && prevState.authState.type !== 'logged-in') {
      store.receiveToken(state.authState.token)
    }
    if (prevState.authState.type === 'logged-in' && state.authState.type !== 'logged-in') {
      store.receiveToken(undefined)
    }
  })

  return store
}

/**
 * This is an internal function that retrieves or creates a client store.
 * @internal
 */
export const getClientStore = (instance: SanityInstance): ClientStore => {
  return getOrCreateResource(instance, 'clientStore', () => {
    const {config, identity} = instance

    const client = createClient({
      projectId: identity.projectId,
      dataset: identity.dataset,
      token: config?.auth?.token,
      useCdn: false,
      apiVersion: DEFAULT_API_VERSION,
    })
    return createClientStore(instance, client)
  })
}
