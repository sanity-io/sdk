import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {pick} from 'lodash-es'

import {getAuthMethodState, getTokenState} from '../auth/authStore'
import {bindActionGlobally} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'

const DEFAULT_API_VERSION = '2024-11-12'
const DEFAULT_REQUEST_TAG_PREFIX = 'sanity.sdk'

type AllowedClientConfigKey =
  | 'useCdn'
  | 'token'
  | 'perspective'
  | 'apiHost'
  | 'proxy'
  | 'withCredentials'
  | 'timeout'
  | 'maxRetries'
  | 'dataset'
  | 'projectId'
  | 'requestTagPrefix'
  | 'useProjectHostname'

const allowedKeys = Object.keys({
  'apiHost': null,
  'useCdn': null,
  'token': null,
  'perspective': null,
  'proxy': null,
  'withCredentials': null,
  'timeout': null,
  'maxRetries': null,
  'dataset': null,
  'projectId': null,
  'scope': null,
  'apiVersion': null,
  'requestTagPrefix': null,
  'useProjectHostname': null,
  '~experimental_resource': null,
} satisfies Record<keyof ClientOptions, null>) as (keyof ClientOptions)[]

const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  apiVersion: DEFAULT_API_VERSION,
  useCdn: false,
  ignoreBrowserTokenWarning: true,
  allowReconfigure: false,
  requestTagPrefix: DEFAULT_REQUEST_TAG_PREFIX,
}

/**
 * States tracked by the client store
 * @public
 */
export interface ClientStoreState {
  token: string | null
  clients: {[TKey in string]?: SanityClient}
  authMethod?: 'localstorage' | 'cookie'
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
 * These options are utilized by `getClient` and `getClientState` to configure and
 * return appropriate client instances that automatically handle authentication
 * updates and configuration changes.
 *
 * @public
 */
export interface ClientOptions extends Pick<ClientConfig, AllowedClientConfigKey> {
  /**
   * An optional flag to choose between the default client (typically project-level)
   * and the global client ('global'). When set to `'global'`, the global client
   * is used.
   */
  'scope'?: 'default' | 'global'
  /**
   * A required string indicating the API version for the client.
   */
  'apiVersion': string
  /**
   * @internal
   */
  '~experimental_resource'?: ClientConfig['~experimental_resource']
}

const clientStore = defineStore<ClientStoreState>({
  name: 'clientStore',

  getInitialState: (instance) => ({
    clients: {},
    token: getTokenState(instance).getCurrent(),
  }),

  initialize(context) {
    const subscription = listenToToken(context)
    const authMethodSubscription = listenToAuthMethod(context)
    return () => {
      subscription.unsubscribe()
      authMethodSubscription.unsubscribe()
    }
  },
})

/**
 * Updates the client store state when a token is received.
 * @internal
 */
const listenToToken = ({instance, state}: StoreContext<ClientStoreState>) => {
  return getTokenState(instance).observable.subscribe((token) => {
    state.set('setTokenAndResetClients', {token, clients: {}})
  })
}

const listenToAuthMethod = ({instance, state}: StoreContext<ClientStoreState>) => {
  return getAuthMethodState(instance).observable.subscribe((authMethod) => {
    state.set('setAuthMethod', {authMethod})
  })
}

const getClientConfigKey = (options: ClientOptions) => JSON.stringify(pick(options, ...allowedKeys))

/**
 * Retrieves a Sanity client instance configured with the provided options.
 *
 * This function returns a client instance configured for the project or as a
 * global client based on the options provided. It ensures efficient reuse of
 * client instances by returning the same instance for the same options.
 * For automatic handling of authentication token updates, consider using
 * `getClientState`.
 *
 * @public
 */
export const getClient = bindActionGlobally(
  clientStore,
  ({state, instance}, options: ClientOptions) => {
    // Check for disallowed keys
    const providedKeys = Object.keys(options) as (keyof ClientOptions)[]
    const disallowedKeys = providedKeys.filter((key) => !allowedKeys.includes(key))

    if (disallowedKeys.length > 0) {
      const listFormatter = new Intl.ListFormat('en', {style: 'long', type: 'conjunction'})
      throw new Error(
        `The client options provided contains unsupported properties: ${listFormatter.format(disallowedKeys)}. ` +
          `Allowed keys are: ${listFormatter.format(allowedKeys)}.`,
      )
    }

    const tokenFromState = state.get().token
    const {clients, authMethod} = state.get()
    const projectId = options.projectId ?? instance.config.projectId
    const dataset = options.dataset ?? instance.config.dataset
    const apiHost = options.apiHost ?? instance.config.auth?.apiHost

    const effectiveOptions: ClientOptions = {
      ...DEFAULT_CLIENT_CONFIG,
      ...((options.scope === 'global' || !projectId) && {useProjectHostname: false}),
      token: authMethod === 'cookie' ? undefined : (tokenFromState ?? undefined),
      ...options,
      ...(projectId && {projectId}),
      ...(dataset && {dataset}),
      ...(apiHost && {apiHost}),
    }

    if (effectiveOptions.token === null || typeof effectiveOptions.token === 'undefined') {
      delete effectiveOptions.token
      if (authMethod === 'cookie') {
        effectiveOptions.withCredentials = true
      }
    } else {
      delete effectiveOptions.withCredentials
    }

    const key = getClientConfigKey(effectiveOptions)

    if (clients[key]) return clients[key]

    const client = createClient(effectiveOptions)
    state.set('addClient', (prev) => ({clients: {...prev.clients, [key]: client}}))

    return client
  },
)

/**
 * Returns a state source for the Sanity client instance.
 *
 * This function provides a subscribable state source that emits updated client
 * instances whenever relevant configurations change (such as authentication tokens).
 * Use this when you need to react to client configuration changes in your application.
 *
 * @public
 */
export const getClientState = bindActionGlobally(
  clientStore,
  createStateSourceAction(({instance}, options: ClientOptions) => getClient(instance, options)),
)
