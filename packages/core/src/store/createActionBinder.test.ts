import {beforeEach, describe, expect, it, vi} from 'vitest'

import {type DocumentResource} from '../config/sanityConfig'
import {
  bindActionByResource,
  bindActionByResourceAndPerspective,
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
    const binder = createActionBinder((..._rest) => ({name: ''}))
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
    const instance = createSanityInstance()

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
    const binder = createActionBinder((instance, ..._rest) => {
      return {name: instance.instanceId}
    })
    const storeDefinition = {
      name: 'TestStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((context, val: number) => {
      context.state.counter += val
      return context.state.counter
    })
    const boundAction = binder(storeDefinition, action)
    const instanceA = createSanityInstance()
    const instanceB = createSanityInstance()

    const resultA = boundAction(instanceA, 3)
    const resultB = boundAction(instanceB, 4)

    expect(resultA).toBe(3)
    expect(resultB).toBe(4)
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledTimes(2)
  })

  it('should dispose the store instance when the last instance is disposed', () => {
    const binder = createActionBinder((..._rest) => ({name: ''}))
    const storeDefinition = {
      name: 'TestStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((context) => context.state.counter)
    const boundAction = binder(storeDefinition, action)
    const instance1 = createSanityInstance()
    const instance2 = createSanityInstance()

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

describe('bindActionGlobally', () => {
  it('should work correctly ignoring config in key generation', () => {
    const storeDefinition = {
      name: 'GlobalStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context, x: number) => x)
    const boundAction = bindActionGlobally(storeDefinition, action)

    // Create instances with different configs
    const instance1 = createSanityInstance()
    const instance2 = createSanityInstance()

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

describe('bindActionByResource', () => {
  it('should resolve from config.defaultResource when no resource provided', () => {
    const storeDefinition = {
      name: 'ResourceNamedStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((context) => context.key)
    const boundAction = bindActionByResource(storeDefinition, action)
    const instance = createSanityInstance({
      defaultResource: {projectId: 'named-proj', dataset: 'named-ds'},
    })
    const result = boundAction(instance, {})
    expect(result).toEqual(
      expect.objectContaining({
        name: 'named-proj.named-ds',
        resource: {projectId: 'named-proj', dataset: 'named-ds'},
      }),
    )
  })

  it('should throw an error when provided an invalid resource', () => {
    const storeDefinition = {
      name: 'ResourceStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context) => 'success')
    const boundAction = bindActionByResource(storeDefinition, action)
    const instance = createSanityInstance()

    expect(() =>
      boundAction(instance, {resource: {invalid: 'resource'} as unknown as DocumentResource}),
    ).toThrow('Received invalid resource:')
  })

  it('should work correctly with a valid dataset resource', () => {
    const storeDefinition = {
      name: 'ResourceStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context) => 'success')
    const boundAction = bindActionByResource(storeDefinition, action)
    const instance = createSanityInstance()

    const result = boundAction(instance, {
      resource: {projectId: 'proj2', dataset: 'ds2'},
    })
    expect(result).toBe('success')
  })
})

describe('bindActionByResourceAndPerspective', () => {
  it('should throw an error when provided an invalid resource', () => {
    const storeDefinition = {
      name: 'PerspectiveStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context) => 'success')
    const boundAction = bindActionByResourceAndPerspective(storeDefinition, action)
    const instance = createSanityInstance()

    expect(() =>
      boundAction(instance, {
        resource: {invalid: 'resource'} as unknown as DocumentResource,
        perspective: 'drafts',
      }),
    ).toThrow('Received invalid resource:')
  })

  it('should work correctly with a valid dataset resource and explicit perspective', () => {
    const storeDefinition = {
      name: 'PerspectiveStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context) => 'success')
    const boundAction = bindActionByResourceAndPerspective(storeDefinition, action)
    const instance = createSanityInstance()

    const result = boundAction(instance, {
      resource: {projectId: 'proj2', dataset: 'ds2'},
      perspective: 'drafts',
    })
    expect(result).toBe('success')
  })

  it('should throw an error when no resource provided and no default resource configured', () => {
    const storeDefinition = {
      name: 'PerspectiveStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context) => 'success')
    const boundAction = bindActionByResourceAndPerspective(storeDefinition, action)
    const instance = createSanityInstance({})

    // @ts-expect-error - test invalid argument
    expect(() => boundAction(instance, {perspective: 'drafts' as const})).toThrow(
      'No resource provided and no default resource configured.',
    )
  })

  it('should work correctly with valid dataset resource and no perspective (falls back to drafts)', () => {
    const storeDefinition = {
      name: 'PerspectiveStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context) => 'success')
    const boundAction = bindActionByResourceAndPerspective(storeDefinition, action)
    const instance = createSanityInstance()

    const result = boundAction(instance, {
      resource: {projectId: 'proj1', dataset: 'ds1'},
    })
    expect(result).toBe('success')
  })

  it('should fall back to "drafts" when options.perspective is not provided', () => {
    const storeDefinition = {
      name: 'PerspectiveStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((context) => context.key)
    const boundAction = bindActionByResourceAndPerspective(storeDefinition, action)
    const instance = createSanityInstance({
      perspective: 'published',
    })

    const result = boundAction(instance, {resource: {projectId: 'proj2', dataset: 'ds2'}})
    expect(result).toEqual(
      expect.objectContaining({
        name: 'proj2.ds2:published',
        perspective: 'published',
      }),
    )
  })

  it('should create separate store instances for different perspectives', () => {
    const storeDefinition = {
      name: 'PerspectiveStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((context, _options, increment: number) => {
      context.state.counter += increment
      return context.state.counter
    })
    const boundAction = bindActionByResourceAndPerspective(storeDefinition, action)
    // Use unique project/dataset so we don't reuse stores from other tests
    const instance = createSanityInstance()

    const resultDrafts = boundAction(
      instance,
      {resource: {projectId: 'proj3', dataset: 'ds3'}, perspective: 'drafts'},
      3,
    )
    const resultPublished = boundAction(
      instance,
      {resource: {projectId: 'proj3', dataset: 'ds3'}, perspective: 'published'},
      4,
    )

    expect(resultDrafts).toBe(3)
    expect(resultPublished).toBe(4)
    // Two stores: one for drafts, one for published
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledTimes(2)
  })

  it('should create separate store instance for release perspective', () => {
    const storeDefinition = {
      name: 'PerspectiveStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context) => 'success')
    const boundAction = bindActionByResourceAndPerspective(storeDefinition, action)
    const instance = createSanityInstance()

    const result = boundAction(instance, {
      resource: {projectId: 'proj1', dataset: 'ds1'},
      perspective: {releaseName: 'release1'},
    })
    expect(result).toBe('success')
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        name: 'proj1.ds1:release1',
        perspective: {releaseName: 'release1'},
      }),
      storeDefinition,
    )
  })

  it('should throw when provided a stackable perspective', () => {
    const storeDefinition = {
      name: 'PerspectiveStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((_context) => 'success')
    const boundAction = bindActionByResourceAndPerspective(storeDefinition, action)
    const instance = createSanityInstance()

    expect(() =>
      boundAction(instance, {
        resource: {projectId: 'proj1', dataset: 'ds1'},
        perspective: ['drafts', 'release1'] as unknown as 'drafts',
      }),
    ).toThrow('Stackable perspectives are not supported.')
  })

  it('should reuse same store when same resource and perspective are used', () => {
    const storeDefinition = {
      name: 'PerspectiveStore',
      getInitialState: () => ({counter: 0}),
    }
    const action = vi.fn((context, _options, increment: number) => {
      context.state.counter += increment
      return context.state.counter
    })
    const boundAction = bindActionByResourceAndPerspective(storeDefinition, action)
    // Use unique project/dataset so we don't reuse stores from other tests
    const instance = createSanityInstance()

    const result1 = boundAction(
      instance,
      {resource: {projectId: 'proj4', dataset: 'ds4'}, perspective: 'drafts'},
      2,
    )
    const result2 = boundAction(
      instance,
      {resource: {projectId: 'proj4', dataset: 'ds4'}, perspective: 'drafts'},
      3,
    )

    expect(result1).toBe(2)
    expect(result2).toBe(5)
    expect(vi.mocked(createStoreInstance)).toHaveBeenCalledTimes(1)
  })
})
