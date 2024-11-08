import type {SanityClient} from '@sanity/client'
import type {StateCreator} from 'zustand'

interface ClientOptions {
  apiVersion: string
}

export interface ClientState {
  clients: Record<string, SanityClient>
  getClient: (options: ClientOptions) => SanityClient
}

// Simplified slice creator type
type ClientSlice = (
  set: Parameters<StateCreator<ClientState>>[0],
  get: Parameters<StateCreator<ClientState>>[1],
) => ClientState

// Create the store slice
export const createClientStore = (client: SanityClient): ClientSlice => {
  return (set, get) => ({
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
  })
}
