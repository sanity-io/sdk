import {createClient, type SanityClient} from '@sanity/client'

import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {createResource, type Resource} from '../store/createResource'
import {subscribeToAuthEvents} from './actions/subscribeToAuthEvents'

const DEFAULT_API_VERSION = 'v2024-11-12'

type ClientContext = null

export interface ClientState {
  defaultClient: SanityClient
  clients: Map<string, SanityClient>
}

export const clientStore = createResource<ClientContext, ClientState>('clientStore', {
  getContext: () => null,
  getInitialState: ({instance}) => {
    const {identity, config} = instance
    const defaultClient = createClient({
      projectId: identity.projectId,
      dataset: identity.dataset,
      token: config?.auth?.token,
      useCdn: false,
      apiVersion: DEFAULT_API_VERSION,
    })
    const clients = new Map<string, SanityClient>()
    clients.set(DEFAULT_API_VERSION, defaultClient)
    return {
      defaultClient,
      clients,
    }
  },
  initialize: ({instance}) => {
    const authEventSubscription = subscribeToAuthEvents(instance)
    return () => {
      authEventSubscription.unsubscribe()
    }
  },
})

const createClientStore = (): Resource<ClientContext, ClientState> => {
  return clientStore
}

export const getClientStore = (instance: SanityInstance): Resource<ClientContext, ClientState> => {
  return getOrCreateResource(instance, 'clientStore', () => createClientStore())
}
