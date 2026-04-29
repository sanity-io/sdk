import {
  type ClientConfig,
  type ClientPerspective,
  createClient,
  type SanityClient,
} from '@sanity/client'
import {pick} from 'lodash-es'

import {getAuthMethodState, getTokenState} from '../auth/authStore'
import {
  type DocumentResource,
  isCanvasResource,
  isDatasetResource,
  isMediaLibraryResource,
} from '../config/sanityConfig'
import {bindActionGlobally} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {getStagingApiHost} from '../utils/getStagingApiHost'

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
  apiHost: null,
  useCdn: null,
  token: null,
  perspective: null,
  proxy: null,
  withCredentials: null,
  timeout: null,
  maxRetries: null,
  dataset: null,
  projectId: null,
  apiVersion: null,
  requestTagPrefix: null,
  useProjectHostname: null,
  resource: null,
  scope: null,
} satisfies Record<keyof ClientOptions, null>) as (keyof ClientOptions)[]

const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  apiVersion: DEFAULT_API_VERSION,
  useCdn: false,
  ignoreBrowserTokenWarning: true,
  allowReconfigure: false,
  requestTagPrefix: DEFAULT_REQUEST_TAG_PREFIX,
  useProjectHostname: false,
} satisfies ClientConfig

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
 *
 * - **scope:** An optional flag to choose between the project-specific client
 *   ('project') and the global client ('global'). Most client calls are global by default.
 *   This flag is deprecated and will be removed in a future version;
 *   prefer using the native Sanity client `useProjectHostname` option instead.
 *
 * These options are utilized by `getClient` and `getClientState` to configure and
 * return appropriate client instances that automatically handle authentication
 * updates and configuration changes.
 *
 * @public
 */
export interface ClientOptions extends Pick<ClientConfig, AllowedClientConfigKey> {
  /**
   * The perspective to use for the client. Note that array-based perpsectives may not behave as expected.
   */
  perspective?: ClientPerspective
  /**
   * A required string indicating the API version for the client.
   */
  apiVersion: string
  /**
   * @internal
   * The SDK resource to use for the client -- this will get transformed into a ClientConfig resource.
   */
  resource?: DocumentResource
  /**
   * An optional flag to choose between the default client (typically project-level)
   * and the global client ('global'). Most client calls are global by default.
   * This flag is deprecated and will be removed in a future version.
   * @deprecated Use `useProjectHostname` instead.
   */
  scope?: 'default' | 'global'
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

type ClientInstanceCacheKeyInput = ClientConfig &
  Partial<Pick<ClientOptions, 'perspective'>> & {
    apiVersion: string
  }

const getClientConfigKey = (options: ClientInstanceCacheKeyInput) =>
  JSON.stringify(pick(options, ...allowedKeys))

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
    if (!options || typeof options !== 'object') {
      throw new Error(
        'getClient() requires a configuration object with at least an "apiVersion" property. ' +
          'Example: getClient(instance, { apiVersion: "2024-11-12" })',
      )
    }

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

    const {resource: sdkResource, scope, ...restOptions} = options

    let resource: ClientConfig['resource'] | undefined

    if (sdkResource) {
      if (isDatasetResource(sdkResource)) {
        resource = {
          type: 'dataset',
          id: `${sdkResource.projectId}.${sdkResource.dataset}`,
        }
      } else if (isMediaLibraryResource(sdkResource)) {
        resource = {type: 'media-library', id: sdkResource.mediaLibraryId}
      } else if (isCanvasResource(sdkResource)) {
        resource = {type: 'canvas', id: sdkResource.canvasId}
      }
    } else if (!options.projectId || !options.dataset) {
      const {projectId, dataset} = instance.config
      if (projectId && dataset) {
        resource = {type: 'dataset', id: `${projectId}.${dataset}`}
      }
    }

    const apiHost = options.apiHost ?? instance.config.auth?.apiHost ?? getStagingApiHost()

    const effectiveOptions = {
      ...DEFAULT_CLIENT_CONFIG,
      // assume explicit projectId / dataset rather than resource means project-specific client
      // useProjectHostname will also navigate to the correct endpoint with just a resource
      ...((options.projectId && options.dataset) || scope === 'default'
        ? {useProjectHostname: true}
        : {}),
      token: authMethod === 'cookie' ? undefined : (tokenFromState ?? undefined),
      ...restOptions,
      ...(apiHost && {apiHost}),
      ...(resource && {resource}),
    }

    // When a resource is provided, don't use projectId/dataset - the client should be "projectless"
    // The client code itself will ignore the non-resource config, so we do this to prevent confusing the user.
    // (ref: https://github.com/sanity-io/client/blob/5c23f81f5ab93a53f5b22b39845c867988508d84/src/data/dataMethods.ts#L691)
    if (options.resource) {
      if (options.projectId || options.dataset) {
        // eslint-disable-next-line no-console
        console.warn(
          'Both resource and explicit projectId/dataset are provided. The resource will be used and projectId/dataset will be ignored.',
        )
      }
      delete effectiveOptions.projectId
      delete effectiveOptions.dataset
      effectiveOptions.useProjectHostname = false
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
