import {createInstance as createMFInstance} from '@module-federation/runtime'
import {
  type ModuleFederationRuntimePlugin,
  type UserOptions,
} from '@module-federation/runtime/types'
import {createLogger} from '@sanity/sdk/_internal'

type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * @public
 */
export type FederationRemote = {
  name: string
  entry: string
}

const MANIFEST_FILE = 'mf-manifest.json'

function withManifest<T extends {entry: string}>(remote: T): T {
  if (remote.entry.endsWith(`/${MANIFEST_FILE}`)) return remote
  const base = remote.entry.endsWith('/') ? remote.entry : `${remote.entry}/`
  return {...remote, entry: new URL(MANIFEST_FILE, base).href}
}

/**
 * @public
 */
export type CreateRemoteInstanceOptions = MakeOptional<
  Pick<UserOptions, 'name' | 'remotes' | 'shared' | 'plugins'>,
  'remotes' | 'plugins'
>

/**
 * @public
 */
export interface RemoteInstance {
  registerRemotes(remotes: FederationRemote[]): void
  /** Loads and evaluates a remote expose. */
  loadRemote<T>(id: string): Promise<T | null>
  /** Preloads assets without evaluating them; omit exposes to warm the whole remote. */
  preloadRemote(name: string, exposes?: string[]): Promise<void>
}

/**
 * Creates a client for registering, loading, and preloading federated modules.
 * @public
 */
export function createRemoteInstance(options: CreateRemoteInstanceOptions): RemoteInstance {
  const logger = createLogger(options.name)
  const instance = createMFInstance({
    ...options,
    plugins: [log(logger.debug), ...(options.plugins ?? [])],
    remotes:
      options.remotes?.map((remote) => ('entry' in remote ? withManifest(remote) : remote)) ?? [],
  })

  return {
    registerRemotes: (remotes) =>
      instance.registerRemotes(remotes.map(withManifest), {force: false}),
    loadRemote: async <T>(id: string) => {
      let remoteModule: T | null

      try {
        remoteModule = await instance.loadRemote<T>(id)
      } catch (error) {
        throw new Error(`Failed to load remote module "${id}"`, {
          cause: error,
        })
      }

      return remoteModule
    },
    // Async chunks stay on demand: warming them downloads every lazily imported chunk up front.
    preloadRemote: (name, exposes) =>
      instance.preloadRemote([{nameOrAlias: name, exposes, resourceCategory: 'sync'}]),
  }
}

function log(
  onDebug: (message: string, context?: Record<string, unknown>) => void,
): ModuleFederationRuntimePlugin {
  const logEvent = (eventName: string, args: object) => {
    // `origin` logs the whole instance, which is noisy
    const {origin: _origin, ...data} = args as Record<string, unknown>

    onDebug(`[Lifecycle] ${eventName}`, {...data, internal: true})
  }

  return {
    name: 'sanity-logger',
    beforeInit(args) {
      logEvent('beforeInit', args)
      return args
    },
    beforeRegisterRemote(args) {
      logEvent('beforeRegisterRemote', args)
      return args
    },
    beforePreloadRemote(args) {
      logEvent('beforePreloadRemote', args)
    },
    beforeRequest(args) {
      logEvent('beforeRequest', args)
      return args
    },
    afterResolve(args) {
      logEvent('afterResolve', args)
      return args
    },
    onLoad(args) {
      logEvent('onLoad', args)
      return args
    },
    loadShare(args) {
      logEvent('loadShare', args)
    },
    beforeLoadShare(args) {
      logEvent('beforeLoadShare', args)
      return args
    },
  }
}
