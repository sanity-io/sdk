import {
  type ModuleFederationRuntimePlugin,
  type UserOptions,
} from '@module-federation/runtime/types'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createRemoteInstance} from './createRemoteInstance'

const {
  onDebug,
  mockCreateLogger,
  mockRegisterRemotes,
  mockLoadRemote,
  mockPreloadRemote,
  mockCreateMFInstance,
} = vi.hoisted(() => {
  const registerRemotes = vi.fn()
  const loadRemote = vi.fn()
  const preloadRemote = vi.fn()
  const debug = vi.fn()
  return {
    onDebug: debug,
    mockCreateLogger: vi.fn(() => ({debug})),
    mockRegisterRemotes: registerRemotes,
    mockLoadRemote: loadRemote,
    mockPreloadRemote: preloadRemote,
    mockCreateMFInstance: vi.fn((_options: UserOptions) => ({
      registerRemotes,
      loadRemote,
      preloadRemote,
    })),
  }
})

vi.mock('@module-federation/runtime', () => ({
  createInstance: mockCreateMFInstance,
}))

vi.mock('@sanity/sdk/_internal', () => ({createLogger: mockCreateLogger}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createRemoteInstance', () => {
  it('seeds empty remotes and preserves custom plugins', () => {
    const customPlugin = {name: 'custom-plugin'}

    createRemoteInstance({name: 'sanity-workbench', plugins: [customPlugin]})

    expect(mockCreateLogger).toHaveBeenCalledWith('sanity-workbench')
    expect(mockCreateMFInstance).toHaveBeenCalledWith({
      name: 'sanity-workbench',
      remotes: [],
      plugins: [expect.objectContaining({name: 'sanity-logger'}), customPlugin],
    })
  })

  it('seeds the underlying instance with the manifest of each remote entry', () => {
    createRemoteInstance({
      name: 'sanity-workbench',
      remotes: [{name: 'studio-1', entry: 'https://example.com/apps/studio-1/'}],
    })

    expect(mockCreateMFInstance).toHaveBeenCalledWith({
      name: 'sanity-workbench',
      plugins: [expect.objectContaining({name: 'sanity-logger'})],
      remotes: [{name: 'studio-1', entry: 'https://example.com/apps/studio-1/mf-manifest.json'}],
    })
  })

  it('leaves a version-based remote untouched', () => {
    const remote = {name: 'studio-1', version: '1.0.0'}

    createRemoteInstance({name: 'sanity-workbench', remotes: [remote]})

    expect(mockCreateMFInstance).toHaveBeenCalledWith({
      name: 'sanity-workbench',
      plugins: [expect.objectContaining({name: 'sanity-logger'})],
      remotes: [remote],
    })
  })

  it('registers a remote origin as its manifest, without forcing re-registration', () => {
    const instance = createRemoteInstance({name: 'sanity-workbench'})

    instance.registerRemotes([{name: 'studio-1', entry: 'https://example.com'}])

    expect(mockRegisterRemotes).toHaveBeenCalledWith(
      [{name: 'studio-1', entry: 'https://example.com/mf-manifest.json'}],
      {force: false},
    )
  })

  it('leaves an entry that already names the manifest untouched', () => {
    const instance = createRemoteInstance({name: 'sanity-workbench'})
    const remotes = [{name: 'studio-1', entry: 'https://example.com/mf-manifest.json'}]

    instance.registerRemotes(remotes)

    expect(mockRegisterRemotes).toHaveBeenCalledWith(remotes, {force: false})
  })

  it('resolves with the loaded module on success', async () => {
    const module = {render: () => () => {}}
    mockLoadRemote.mockResolvedValue(module)
    const instance = createRemoteInstance({name: 'sanity-workbench'})

    await expect(instance.loadRemote('studio-1/App')).resolves.toBe(module)
  })

  it('wraps a load failure with the module id and original cause', async () => {
    const cause = new Error('network down')
    mockLoadRemote.mockRejectedValue(cause)
    const instance = createRemoteInstance({name: 'sanity-workbench'})

    await expect(instance.loadRemote('studio-1/App')).rejects.toMatchObject({
      message: 'Failed to load remote module "studio-1/App"',
      cause,
    })
  })

  it('preloads the sync assets of specific exposes, leaving async chunks on demand', () => {
    const instance = createRemoteInstance({name: 'sanity-workbench'})

    instance.preloadRemote('studio-1', ['views/feed/panel'])

    expect(mockPreloadRemote).toHaveBeenCalledWith([
      {
        nameOrAlias: 'studio-1',
        exposes: ['views/feed/panel'],
        resourceCategory: 'sync',
      },
    ])
  })

  it('preloads the whole remote when no exposes are given', () => {
    const instance = createRemoteInstance({name: 'sanity-workbench'})

    instance.preloadRemote('studio-1')

    expect(mockPreloadRemote).toHaveBeenCalledWith([
      {nameOrAlias: 'studio-1', exposes: undefined, resourceCategory: 'sync'},
    ])
  })
})

describe('lifecycle logging', () => {
  const hooks = [
    'beforeInit',
    'beforeRegisterRemote',
    'beforePreloadRemote',
    'beforeRequest',
    'afterResolve',
    'onLoad',
    'loadShare',
    'beforeLoadShare',
  ] as const

  it.each(hooks)('logs %s without the runtime instance', (hook) => {
    createRemoteInstance({name: 'sanity-workbench'})
    const plugin = mockCreateMFInstance.mock.calls[0][0]
      .plugins![0] as ModuleFederationRuntimePlugin
    // Deliberately partial args: only the logger's origin filtering is under test.
    plugin[hook]?.({origin: 'noisy', id: hook} as never)
    expect(onDebug).toHaveBeenCalledWith(`[Lifecycle] ${hook}`, {id: hook, internal: true})
  })
})
