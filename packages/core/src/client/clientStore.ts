import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {createSelector} from 'reselect'

import {getTokenState} from '../auth/authStore'
import {type ResourceId} from '../document/patchOperations'
import {type SanityInstance} from '../instance/types'
import {type ActionContext, createAction, createInternalAction} from '../resources/createAction'
import {createResource, type Resource} from '../resources/createResource'
import {createStateSourceAction} from '../resources/createStateSourceAction'

const DEFAULT_API_VERSION = '2024-11-12'
const DEFAULT_REQUEST_TAG_PREFIX = 'sanity.sdk'

/**
 * States tracked by the client store
 * @public
 */
export interface ClientState {
  defaultClient: SanityClient
  defaultGlobalClient: SanityClient
}

/**
 * Options used when retrieving a client instance from the client store.
 *
 * This interface extends the base {@link ClientConfig} and adds:
 *
 * - **apiVersion:** A required string indicating the API version for the client.
 * - **scope:** An optional flag to choose between the project-specific client
 *   ('project') and the global client ('global'). When set to `'global'`, the
 *   global client is used.
 *
 * These options are utilized by `getClient` and `getClientState` to return a memoized
 * client instance, ensuring that clients are reused for identical configurations and that
 * updates (such as auth token changes) propagate correctly.
 *
 * @public
 */
export interface ClientOptions extends ClientConfig {
  /**
   * An optional flag to choose between the project-specific client ('project')
   * and the global client ('global'). When set to `'global'`, the global client
   * is used.
   */
  scope?: 'project' | 'global'
  /**
   * A required string indicating the API version for the client.
   */
  apiVersion: string

  /**
   * A resource identifier for a document, in the format of `projectId.dataset`
   */
  resourceId?: ResourceId
}

const clientStore: Resource<ClientState> = createResource({
  name: 'clientStore',

  getInitialState: (instance: SanityInstance) => {
    const {identity, config} = instance
    const defaultClient = createClient({
      projectId: identity.projectId,
      dataset: identity.dataset,
      token: config?.auth?.token,
      useCdn: false,
      apiVersion: DEFAULT_API_VERSION,
      requestTagPrefix: DEFAULT_REQUEST_TAG_PREFIX,
      ...(config?.auth?.apiHost ? {apiHost: config.auth.apiHost} : {}),
    })

    const defaultGlobalClient = createClient({
      token: config?.auth?.token,
      useCdn: false,
      apiVersion: 'vX', // Many global APIs are only available under this version, we may need to support other versions in the future
      useProjectHostname: false,
      requestTagPrefix: DEFAULT_REQUEST_TAG_PREFIX,
      ...(config?.auth?.apiHost ? {apiHost: config.auth.apiHost} : {}),
    })

    return {
      defaultClient,
      defaultGlobalClient,
    }
  },

  initialize() {
    const authEventSubscription = subscribeToAuthEvents(this)
    return () => {
      authEventSubscription.unsubscribe()
    }
  },
})

const optionsCache = new WeakMap<SanityClient, Map<string, ClientOptions>>()

const receiveToken = (prev: ClientState, token: string | undefined): ClientState => {
  const newDefaultClient = prev.defaultClient.withConfig({
    token,
  })
  const newGlobalClient = prev.defaultGlobalClient.withConfig({
    token,
  })

  // Clear the options cache when token changes to prevent stale client instances
  optionsCache.delete(prev.defaultClient)
  optionsCache.delete(prev.defaultGlobalClient)

  return {
    defaultClient: newDefaultClient,
    defaultGlobalClient: newGlobalClient,
  }
}

/**
 * Updates the client store state when a token is received.
 * @internal
 */
const subscribeToAuthEvents = createInternalAction(
  ({instance, state}: ActionContext<ClientState>) => {
    return () => {
      return getTokenState(instance).observable.subscribe((newToken) => {
        state.set('receiveToken', (prev) => receiveToken(prev, newToken ?? undefined))
      })
    }
  },
)

const defaultClientSelector = (state: ClientState, options: ClientOptions) =>
  options?.scope === 'global' ? state.defaultGlobalClient : state.defaultClient

const memoizedOptionsSelector = createSelector(
  [defaultClientSelector, (_state: ClientState, options: ClientOptions) => options],
  (client, options) => {
    let nestedCache = optionsCache.get(client)
    if (!nestedCache) {
      nestedCache = new Map<string, ClientOptions>()
      optionsCache.set(client, nestedCache)
    }

    const key = JSON.stringify(options)
    const cached = nestedCache.get(key)
    if (cached) return cached

    nestedCache.set(key, options)
    return options
  },
)

const clientSelector = createSelector(
  [defaultClientSelector, memoizedOptionsSelector],
  (client, options) => client.withConfig(options),
)

/**
 * Retrieves a memoized Sanity client instance configured with the provided options.
 *
 * This function uses a memoized selector to return a client instance from the
 * client store, based on the default project or global client. The selector
 * leverages a WeakMap-based cache and reselect to ensure that clients with the
 * same configuration are reused, and that updates, such as authentication token
 * changes, propagate automatically.
 *
 * @public
 */
export const getClient = createAction(
  clientStore,
  ({state}) =>
    (options: ClientOptions) =>
      clientSelector(state.get(), options),
)

/**
 * Returns a state source for the Sanity client instance.
 *
 * This function provides a subscribable state source that emits updated client
 * instances whenever the client configuration changes (for example, due to
 * token updates). It leverages the underlying client store and memoized selector
 * to ensure that subscribers receive the most current client configuration.
 *
 * @public
 */
export const getClientState = createStateSourceAction(clientStore, clientSelector)
