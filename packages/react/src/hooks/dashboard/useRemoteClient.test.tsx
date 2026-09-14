import {createSanityInstance, type SanityInstance} from '@sanity/sdk'
import {type ReactNode, StrictMode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {SanityInstanceContext} from '../../context/SanityInstanceContext'
import {useRemoteClient} from './useRemoteClient'

const {createMFInstance} = vi.hoisted(() => ({
  createMFInstance: vi.fn(() => ({
    registerRemotes: vi.fn(),
    loadRemote: vi.fn(),
    preloadRemote: vi.fn(),
  })),
}))

vi.mock('@module-federation/runtime', () => ({createInstance: createMFInstance}))

function wrapper(instance: SanityInstance) {
  return function TestProvider({children}: {children: ReactNode}) {
    return (
      <StrictMode>
        <SanityInstanceContext.Provider value={instance}>{children}</SanityInstanceContext.Provider>
      </StrictMode>
    )
  }
}

describe('useRemoteClient', () => {
  const instances: SanityInstance[] = []
  function createTestInstance() {
    const instance = createSanityInstance()
    instances.push(instance)
    return instance
  }

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    instances.splice(0).forEach((instance) => instance.dispose())
  })

  it("creates a client for the hook's Sanity instance", () => {
    const instance = createTestInstance()
    renderHook(() => useRemoteClient(), {wrapper: wrapper(instance)})

    expect(createMFInstance).toHaveBeenCalledTimes(1)
    expect(createMFInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        name: `sanity-remote-${instance.instanceId}`,
        remotes: [],
      }),
    )
  })

  it('does not create a client for a disposed Sanity instance', () => {
    const instance = createTestInstance()
    instance.dispose()

    expect(() => renderHook(() => useRemoteClient(), {wrapper: wrapper(instance)})).toThrow(
      'Cannot create a remote client for a disposed Sanity instance',
    )
    expect(createMFInstance).not.toHaveBeenCalled()
  })

  it('shares a client across consumers and remounts using the same instance', () => {
    const instance = createTestInstance()
    const first = renderHook(() => useRemoteClient(), {wrapper: wrapper(instance)})
    const second = renderHook(() => useRemoteClient(), {wrapper: wrapper(instance)})
    expect(second.result.current).toBe(first.result.current)
    const client = first.result.current
    first.unmount()
    second.unmount()

    const remounted = renderHook(() => useRemoteClient(), {wrapper: wrapper(instance)})
    expect(remounted.result.current).toBe(client)
    expect(createMFInstance).toHaveBeenCalledTimes(1)
  })

  it('isolates clients between Sanity instances', () => {
    const firstInstance = createTestInstance()
    const secondInstance = createTestInstance()
    const first = renderHook(() => useRemoteClient(), {wrapper: wrapper(firstInstance)})
    const second = renderHook(() => useRemoteClient(), {wrapper: wrapper(secondInstance)})

    expect(first.result.current).not.toBe(second.result.current)
    expect(createMFInstance).toHaveBeenCalledTimes(2)
  })
})
