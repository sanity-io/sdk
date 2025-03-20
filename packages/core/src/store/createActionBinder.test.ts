import {beforeEach, describe, expect, it, vi} from 'vitest'

import {bindActionByDataset, bindActionGlobally, createActionBinder} from './createActionBinder'
import {createSanityInstance} from './createSanityInstance'
import {createStoreInstance} from './createStoreInstance'

// Mock store instance creation for testing
vi.mock('./createStoreInstance', () => ({
  createStoreInstance: vi.fn(() => ({state: {counter: 0}, dispose: vi.fn()})),
}))
beforeEach(() => vi.mocked(createStoreInstance).mockClear())

describe('createActionBinder', () => {
  it('should bind an action and call it with correct context and parameters, using caching', () => {
    const binder = createActionBinder(() => '')
    const storeDefinition = {
      name: 'TestStore',
      getInitialState: () => ({counter: 0}),
    }
    // Action that increments counter by given value
    const action = vi.fn((context, increment: number) => {
      context.state.counter += increment
      return context.state.counter
    })
    const boundAction = binder(storeDefinition, action)
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})

    // First call creates store instance
    const result1 = boundAction(instance, 5)
    expect(result1).toBe(5)
    // Second call reuses cached store
    const result2 = boundAction(instance, 5)
    expect(result2).toBe(10)

    expect(action).toHaveBeenCalledTimes(2)
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledTimes(1)
  })

  it('should create separate store instances for different composite keys', () => {
    const binder = createActionBinder(({projectId, dataset}) => `${projectId}.${dataset}`)
    const storeDefinition = {
      name: 'TestStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((context, val: number) => {
      context.state.counter += val
      return context.state.counter
    })
    const boundAction = binder(storeDefinition, action)
    const instanceA = createSanityInstance({projectId: 'p1', dataset: 'd1'})
    const instanceB = createSanityInstance({projectId: 'p2', dataset: 'd2'})

    const resultA = boundAction(instanceA, 3)
    const resultB = boundAction(instanceB, 4)

    expect(resultA).toBe(3)
    expect(resultB).toBe(4)
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledTimes(2)
  })

  it('should dispose the store instance when the last instance is disposed', () => {
    const binder = createActionBinder(() => '')
    const storeDefinition = {
      name: 'TestStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((context) => context.state.counter)
    const boundAction = binder(storeDefinition, action)
    const instance1 = createSanityInstance({projectId: 'p1', dataset: 'd1'})
    const instance2 = createSanityInstance({projectId: 'p1', dataset: 'd1'})

    // Call action on both instances
    boundAction(instance1)
    boundAction(instance2)
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledTimes(1)

    const [{value: storeInstance}] = vi.mocked(createStoreInstance).mock.results
    expect(storeInstance).toBeDefined()

    // First disposal shouldn't trigger store disposal
    instance1.dispose()
    expect(storeInstance.dispose).not.toHaveBeenCalled()

    // Last disposal should trigger store disposal
    instance2.dispose()
    expect(storeInstance.dispose).toHaveBeenCalledTimes(1)
  })
})

describe('bindActionByDataset', () => {
  it('should work correctly when projectId and dataset are provided', () => {
    const storeDefinition = {
      name: 'DSStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context, value: string) => value)
    const boundAction = bindActionByDataset(storeDefinition, action)
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    const result = boundAction(instance, 'hello')
    expect(result).toBe('hello')
  })

  it('should throw an error if projectId or dataset is missing', () => {
    const storeDefinition = {
      name: 'DSStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context) => 'fail')
    const boundAction = bindActionByDataset(storeDefinition, action)
    // Instance with missing dataset
    const instance = createSanityInstance({projectId: 'proj1', dataset: ''})
    expect(() => boundAction(instance)).toThrow(
      'This API requires a project ID and dataset configured.',
    )
  })
})

describe('bindActionGlobally', () => {
  it('should work correctly ignoring config in key generation', () => {
    const storeDefinition = {
      name: 'GlobalStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context, x: number) => x)
    const boundAction = bindActionGlobally(storeDefinition, action)

    // Create instances with different configs
    const instance1 = createSanityInstance({projectId: 'any', dataset: 'any'})
    const instance2 = createSanityInstance({projectId: 'different', dataset: 'config'})

    // Both instances should use the same store
    const result1 = boundAction(instance1, 42)
    const result2 = boundAction(instance2, 99)

    expect(result1).toBe(42)
    expect(result2).toBe(99)

    // Verify single store instance used
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledTimes(1)

    // Verify action called with correct arguments
    expect(action).toHaveBeenNthCalledWith(1, expect.anything(), 42)
    expect(action).toHaveBeenNthCalledWith(2, expect.anything(), 99)

    // Test disposal tracking
    const [{value: storeInstance}] = vi.mocked(createStoreInstance).mock.results
    instance1.dispose()
    expect(storeInstance.dispose).not.toHaveBeenCalled()

    instance2.dispose()
    expect(storeInstance.dispose).toHaveBeenCalledTimes(1)
  })
})
