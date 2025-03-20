import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from './createSanityInstance'
import {createStoreInstance} from './createStoreInstance'
import {type StoreDefinition} from './defineStore'

describe('createStoreInstance', () => {
  let instance: ReturnType<typeof createSanityInstance>

  beforeEach(() => {
    // Mock crypto for predictable instance IDs
    vi.stubGlobal('crypto', {
      randomUUID: () => 'test-uuid-1234',
    })

    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
  })

  const storeDef: StoreDefinition<{count: number}> = {
    name: 'TestStore',
    getInitialState: (inst) => ({
      count: inst.config.projectId === 'test' ? 0 : -1,
    }),
  }

  it('should create store instance with initial state', () => {
    const store = createStoreInstance(instance, storeDef)
    expect(store.state).toBeDefined()
  })

  it('should call getInitialState with Sanity instance', () => {
    const getInitialState = vi.fn(() => ({count: 0}))
    createStoreInstance(instance, {...storeDef, getInitialState})
    expect(getInitialState).toHaveBeenCalledWith(instance)
  })

  it('should call initialize function with context', () => {
    const initialize = vi.fn()

    const store = createStoreInstance(instance, {
      ...storeDef,
      initialize,
    })
    expect(initialize).toHaveBeenCalledWith({
      state: store.state,
      instance,
    })
  })

  it('should handle store disposal with cleanup function', () => {
    const disposeMock = vi.fn()

    const store = createStoreInstance(instance, {
      ...storeDef,
      initialize: () => disposeMock,
    })
    store.dispose()

    expect(disposeMock).toHaveBeenCalledTimes(1)
    expect(store.isDisposed()).toBe(true)
  })

  it('should handle disposal without initialize function', () => {
    const store = createStoreInstance(instance, storeDef)
    store.dispose()
    expect(store.isDisposed()).toBe(true)
  })

  it('should prevent multiple disposals', () => {
    const disposeMock = vi.fn()

    const store = createStoreInstance(instance, {
      ...storeDef,
      initialize: () => disposeMock,
    })
    store.dispose()
    store.dispose()

    expect(disposeMock).toHaveBeenCalledTimes(1)
  })
})
