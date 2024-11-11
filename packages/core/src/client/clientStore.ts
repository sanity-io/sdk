import type {SanityClient} from '@sanity/client'
import {type StoreApi} from 'zustand'
import {devtools} from 'zustand/middleware'
import {createStore} from 'zustand/vanilla'

export interface ClientOptions {
  apiVersion: string
}

interface ClientState {
  clients: Record<string, SanityClient>
  getClient: (options: ClientOptions) => SanityClient
}

export type ClientStore = StoreApi<ClientState>

/*
 * We try to retrieve a client from state based on the apiVersion.
 * If it doesn't exist, we create a new client and add it to state.
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
          if (!state.clients[options.apiVersion]) {
            const newClient = client.withConfig(options)
            set({
              clients: {
                ...state.clients,
                [options.apiVersion]: newClient,
              },
            })
            return newClient
          }
          return state.clients[options.apiVersion]
        },
      }),
      {
        name: 'SanityClientStore',
        enabled: true, // Should be process.env.NODE_ENV === 'development'
      },
    ),
  )
}
