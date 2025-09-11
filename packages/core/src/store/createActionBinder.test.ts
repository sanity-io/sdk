import {beforeEach, describe, expect, it, vi} from 'vitest'

import {
  bindActionByDataset,
  bindActionByMediaLibrary,
  bindActionByResource,
  bindActionGlobally,
  createActionBinder,
} from './createActionBinder'
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

describe('bindActionByMediaLibrary', () => {
  it('should work correctly when mediaLibraryId is provided', () => {
    const storeDefinition = {
      name: 'MediaStore',
      getInitialState: () => ({assets: {}}),
    }
    const action = vi.fn((_context, value: string) => value)
    const boundAction = bindActionByMediaLibrary(storeDefinition, action)
    const instance = createSanityInstance({mediaLibraryId: 'lib123'})
    const result = boundAction(instance, 'hello')
    expect(result).toBe('hello')
  })

  it('should throw an error if mediaLibraryId is missing', () => {
    const storeDefinition = {
      name: 'MediaStore',
      getInitialState: () => ({assets: {}}),
    }
    const action = vi.fn((_context) => 'fail')
    const boundAction = bindActionByMediaLibrary(storeDefinition, action)
    // Instance with missing mediaLibraryId
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    expect(() => boundAction(instance)).toThrow('This API requires a media library ID configured.')
  })

  it('should create separate store instances for different media libraries', () => {
    const storeDefinition = {
      name: 'MediaStore',
      getInitialState: () => ({assets: {}}),
    }
    const action = vi.fn((context, assetId: string) => {
      // Initialize assets if not present
      if (!context.state.assets) {
        context.state.assets = {}
      }
      context.state.assets[assetId] = true
      return Object.keys(context.state.assets).length
    })
    const boundAction = bindActionByMediaLibrary(storeDefinition, action)

    const instance1 = createSanityInstance({mediaLibraryId: 'lib1'})
    const instance2 = createSanityInstance({mediaLibraryId: 'lib2'})

    const result1 = boundAction(instance1, 'asset1')
    const result2 = boundAction(instance2, 'asset2')

    expect(result1).toBe(1)
    expect(result2).toBe(1) // Different media library, so separate state
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledTimes(2)
  })
})

describe('bindActionByResource', () => {
  it('should work correctly with dataset configuration', () => {
    const storeDefinition = {
      name: 'ResourceStore',
      getInitialState: () => ({data: {}}),
    }
    const action = vi.fn((_context, value: string) => value)
    const boundAction = bindActionByResource(storeDefinition, action)
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    const result = boundAction(instance, 'hello')
    expect(result).toBe('hello')
  })

  it('should work correctly with media library configuration', () => {
    const storeDefinition = {
      name: 'ResourceStore',
      getInitialState: () => ({data: {}}),
    }
    const action = vi.fn((_context, value: string) => value)
    const boundAction = bindActionByResource(storeDefinition, action)
    const instance = createSanityInstance({mediaLibraryId: 'lib123'})
    const result = boundAction(instance, 'hello')
    expect(result).toBe('hello')
  })

  it('should throw an error if neither dataset nor media library is configured', () => {
    const storeDefinition = {
      name: 'ResourceStore',
      getInitialState: () => ({data: {}}),
    }
    const action = vi.fn((_context) => 'fail')
    const boundAction = bindActionByResource(storeDefinition, action)
    // Instance with no valid configuration
    const instance = createSanityInstance({})
    expect(() => boundAction(instance)).toThrow(
      'This API requires either a project ID and dataset, or a media library ID configured.',
    )
  })

  it.skip('should create separate store instances for different resource types', () => {
    const storeDefinition = {
      name: 'ResourceStore',
      getInitialState: () => ({data: {}}),
    }
    const action = vi.fn((context, key: string) => {
      if (!context.state.data) {
        context.state.data = {}
      }
      context.state.data[key] = true
      return Object.keys(context.state.data).length
    })
    const boundAction = bindActionByResource(storeDefinition, action)

    const datasetInstance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    const mediaLibraryInstance = createSanityInstance({mediaLibraryId: 'lib1'})

    const result1 = boundAction(datasetInstance, 'item1')
    const result2 = boundAction(mediaLibraryInstance, 'item2')

    expect(result1).toBe(1)
    expect(result2).toBe(1) // Different resource type, so separate state
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledTimes(2)
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
