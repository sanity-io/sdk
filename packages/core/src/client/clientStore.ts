import {createClient, type SanityClient} from '@sanity/client'

import {type SanityInstance} from '../instance/types'
import {createResource, type Resource} from '../resources/createResource'
import {subscribeToAuthEvents} from './actions/subscribeToAuthEvents'

const DEFAULT_API_VERSION = '2024-11-12'

/**
 * States tracked by the client store
 * @public
 */
export interface ClientState {
  defaultClient: SanityClient
  clients: Map<string, SanityClient>
}

export const clientStore: Resource<ClientState> = createResource({
  name: 'clientStore',

  getInitialState: (instance: SanityInstance) => {
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

  initialize() {
    const authEventSubscription = subscribeToAuthEvents(this)
    return () => {
      authEventSubscription.unsubscribe()
    }
  },
})
