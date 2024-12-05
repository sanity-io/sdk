import {createClient, type SanityClient} from '@sanity/client'
import {distinctUntilChanged, map, Observable} from 'rxjs'

import {getAuthStore} from '../../auth/getAuthStore'
import type {SanityInstance} from '../../instance/types'
import {createStore} from '../../store/createStore'
import {getClientEvents} from './actions/getClientEvents'
import {getOrCreateClient} from './actions/getOrCreateClient'
import {receiveToken} from './actions/receiveToken'
import {getOrCreateResource} from '../../instance/sanityInstance'

export const DEFAULT_API_VERSION = 'v2024-11-12'

export interface ClientOptions {
  apiVersion?: string
}
export interface ClientState {
  // default client shouldn't be exposed, but is used in creation of new clients
  defaultClient: SanityClient
  clients: Map<string, SanityClient>
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
export const createClientStore = (instance: SanityInstance, defaultClient: SanityClient) => {
  const authStore = getAuthStore(instance)

  const store = createStore(createInitialState(defaultClient), clientStoreActions, {
    name: 'clientStore',
    instance,
  })

  // WHERE DOES THIS GO
  const observableAuthStore = new Observable(authStore.subscribe)
  const tokenSubscription = observableAuthStore
    .pipe(
      map((authState) => {
        if (authState.type === 'logged-in') {
          return authState.token
        }
        return undefined
      }),
      distinctUntilChanged(),
    )
    .subscribe(store.receiveToken)

  return store
}

export type ClientStore = ReturnType<typeof createClientStore>

/**
 * This is an internal function that retrieves a client store.
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
