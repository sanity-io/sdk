import {
  type AuthState as ClientAuthState,
  type ClientConfig,
  createClient,
  type SanityClient,
} from '@sanity/client'
import {type Observable} from 'rxjs'

import {getClientAuthState} from '../auth/authStore'
import {
  type DocumentResource,
  isCanvasResource,
  isDatasetResource,
  isMediaLibraryResource,
} from '../config/sanityConfig'
import {bindActionGlobally} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore} from '../store/defineStore'
import {getStagingApiHost} from '../utils/getStagingApiHost'
import {pickProperties} from '../utils/object'

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
  scope: null,
  apiVersion: null,
  requestTagPrefix: null,
  useProjectHostname: null,
  resource: null,
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
  clients: {[TKey in string]?: SanityClient}
  /** Credential stream shared by every client this store creates. */
  auth: Observable<Promise<ClientAuthState>>
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
  scope?: 'default' | 'global'
  /**
   * A required string indicating the API version for the client.
   */
  apiVersion: string

  /**
   * @internal
   * The SDK resource to use for the client -- this will get transformed into a ClientConfig resource.
   */
  resource?: DocumentResource
}

const clientStore = defineStore<ClientStoreState>({
  name: 'clientStore',

  // Clients read their credential from `auth` on every request, so they are
  // created once and a token change no longer tears down their listeners.
  getInitialState: (instance) => ({
    clients: {},
    auth: getClientAuthState(instance).observable,
  }),
})

type ClientInstanceCacheKeyInput = ClientConfig &
  Partial<Pick<ClientOptions, 'scope'>> & {
    apiVersion: string
  }

const getClientConfigKey = (options: ClientInstanceCacheKeyInput) =>
  JSON.stringify(pickProperties(options, allowedKeys))

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

    const {clients, auth} = state.get()
    let projectId = options.projectId ?? instance.config.projectId
    let dataset = options.dataset ?? instance.config.dataset

    let resource: ClientConfig['resource'] | undefined

    if (options.resource) {
      if (isMediaLibraryResource(options.resource)) {
        resource = {type: 'media-library', id: options.resource.mediaLibraryId}
      } else if (isCanvasResource(options.resource)) {
        resource = {type: 'canvas', id: options.resource.canvasId}
      } else if (isDatasetResource(options.resource)) {
        // use project-based routes for datasets to avoid existing CORS and Studio auth cookie issues
        projectId = options.resource.projectId
        dataset = options.resource.dataset
      }
    }

    const apiHost = options.apiHost ?? instance.config.auth?.apiHost ?? getStagingApiHost()

    const effectiveOptions: ClientConfig & {apiVersion: string} = {
      ...DEFAULT_CLIENT_CONFIG,
      ...((options.scope === 'global' || !projectId || resource) && {useProjectHostname: false}),
      ...options,
      ...(projectId && {projectId}),
      ...(dataset && {dataset}),
      ...(resource ? {resource} : {resource: undefined}),
      ...(apiHost && {apiHost}),
    }

    // When a resource is provided, don't use projectId/dataset - the client should be "projectless"
    // The client code itself will ignore the non-resource config, so we do this to prevent confusing the user.
    // (ref: https://github.com/sanity-io/client/blob/5c23f81f5ab93a53f5b22b39845c867988508d84/src/data/dataMethods.ts#L691)
    if (resource) {
      delete effectiveOptions.projectId
      delete effectiveOptions.dataset
    }

    const key = getClientConfigKey(effectiveOptions)

    if (clients[key]) return clients[key]

    // A caller-supplied credential is static; the client rejects it alongside `auth`.
    const hasOwnCredential = Boolean(options.token) || options.withCredentials !== undefined
    const client = createClient(hasOwnCredential ? effectiveOptions : {...effectiveOptions, auth})
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
