import {type SanityClient} from '@sanity/client'
import {devtools} from 'zustand/middleware'
import {createStore, type StoreApi} from 'zustand/vanilla'

/** @public */
export interface ClientOptions {
  apiVersion: string
}

/** @public */
export interface ClientState {
  clients: Record<string, SanityClient>
  getClient: (options: ClientOptions) => SanityClient
}

/** @public */
export type ClientStore = StoreApi<ClientState>

/**
 * This is an internal function that creates a client store.
 * * We try to retrieve a client from state based on the apiVersion.
 * If it doesn't exist, we create a new client and add it to state.
 * @internal
 */
export const createClientStore = (client: SanityClient): ClientStore => {
  return createStore<ClientState>()(
    devtools(
      (set, get) => ({
        clients: {},
        getClient: (options: ClientOptions): SanityClient => {
          if (!options || !options.apiVersion) {
            throw new Error('Missing required `apiVersion` option')
          }
          const state = get()
          // TODO: This key should also include the projectId and dataset
          const clientKey = options.apiVersion
          if (!state.clients[clientKey]) {
            const newClient = client.withConfig(options)
            set(
              {
                clients: {
                  ...state.clients,
                  [clientKey]: newClient,
                },
              },
              false,
              'addVersionedClient',
            )
            return newClient
          }
          return state.clients[clientKey]
        },
      }),
      {
        name: 'SanityClientStore',
        enabled: true, // Should be process.env.NODE_ENV === 'development'
      },
    ),
  )
}
