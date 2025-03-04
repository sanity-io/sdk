import {createSanityInstance, type SanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {throwError} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {createStateSourceHook} from './createStateSourceHook'

// Mock the useSanityInstance hook
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

describe('createStateSourceHook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a hook that provides access to state source', () => {
    const mockInstance = createSanityInstance({resources: [{projectId: 'p', dataset: 'd'}]})
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    const mockState = {count: 0}
    const mockSubscribe = vi.fn()
    const mockGetCurrent = vi.fn(() => mockState)

    const stateSourceFactory = vi.fn().mockReturnValue({
      subscribe: mockSubscribe,
      getCurrent: mockGetCurrent,
      observable: throwError(() => new Error('unexpected usage of observable')),
    })

    const useTestHook = createStateSourceHook(stateSourceFactory)
    const {result} = renderHook(() => useTestHook(0))

    expect(stateSourceFactory).toHaveBeenCalledWith(mockInstance, 0)
    expect(mockGetCurrent).toHaveBeenCalled()
    expect(result.current).toBe(mockState)
  })

  it('should recreate state source when params change', () => {
    const mockInstance = createSanityInstance({resources: [{projectId: 'p', dataset: 'd'}]})
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    const subscribe = vi.fn()
    const stateSourceFactory = vi.fn((_instance: SanityInstance, count: number) => ({
      subscribe,
      getCurrent: () => count,
      observable: throwError(() => new Error('unexpected usage of observable')),
    }))

    const useTestHook = createStateSourceHook(stateSourceFactory)
    const {result, rerender} = renderHook(({count}) => useTestHook(count), {
      initialProps: {count: 0},
    })

    expect(result.current).toEqual(0)
    expect(stateSourceFactory).toHaveBeenCalledWith(mockInstance, 0)

    rerender({count: 1})

    expect(result.current).toEqual(1)
    expect(stateSourceFactory).toHaveBeenCalledWith(mockInstance, 1)
    expect(stateSourceFactory).toHaveBeenCalledTimes(2)
  })

  it('should recreate state source when instance changes', () => {
    const mockInstance1 = createSanityInstance({resources: [{projectId: 'p1', dataset: 'd'}]})
    const mockInstance2 = createSanityInstance({resources: [{projectId: 'p2', dataset: 'd'}]})

    vi.mocked(useSanityInstance).mockReturnValueOnce(mockInstance1)

    const stateSourceFactory = vi.fn((instance: SanityInstance) => ({
      subscribe: vi.fn(),
      getCurrent: () => instance.resources[0].projectId, // TODO: support multiple resources
      observable: throwError(() => new Error('unexpected usage of observable')),
    }))

    const useTestHook = createStateSourceHook(stateSourceFactory)
    const {result, rerender} = renderHook(() => useTestHook())

    expect(result.current).toEqual('p1')

    vi.mocked(useSanityInstance).mockReturnValueOnce(mockInstance2)
    rerender()

    expect(result.current).toEqual('p2')
    expect(stateSourceFactory).toHaveBeenCalledTimes(2)
  })

  it('should handle subscription functionality', () => {
    const mockInstance = createSanityInstance({resources: [{projectId: 'p', dataset: 'd'}]})
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    const mockSubscribe = vi.fn()
    const mockGetCurrent = vi.fn().mockReturnValue({value: 'initial'})

    const stateSourceFactory = vi.fn(() => ({
      subscribe: mockSubscribe,
      getCurrent: mockGetCurrent,
      observable: throwError(() => new Error('unexpected usage of observable')),
    }))

    const useTestHook = createStateSourceHook(stateSourceFactory)
    renderHook(() => useTestHook())

    expect(mockSubscribe).toHaveBeenCalled()
    const subscriber = mockSubscribe.mock.calls[0][0]
    expect(typeof subscriber).toBe('function')
  })

  it('should handle multiple parameters', () => {
    const mockInstance = createSanityInstance({resources: [{projectId: 'p', dataset: 'd'}]})
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    const stateSourceFactory = vi.fn(
      (_instance: SanityInstance, param1: string, param2: number) => ({
        subscribe: vi.fn(),
        getCurrent: () => `${param1}_${param2}`,
        observable: throwError(() => new Error('unexpected usage of observable')),
      }),
    )

    const useTestHook = createStateSourceHook(stateSourceFactory)
    const {result} = renderHook(() => useTestHook('test', 123))

    expect(result.current).toEqual('test_123')
    expect(stateSourceFactory).toHaveBeenCalledWith(mockInstance, 'test', 123)
  })
})
