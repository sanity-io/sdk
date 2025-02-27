import {describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {
  createResource,
  disposeResources,
  getOrCreateResource,
  initializeResource,
  type Resource,
} from './createResource'

describe('createResource', () => {
  const instance = createSanityInstance({projectId: 'test', dataset: 'test'})

  interface TestState {
    value: number
  }

  const testResource: Resource<TestState> = createResource<TestState>({
    name: 'test',
    getInitialState: () => ({value: 0}),
    initialize: vi.fn(),
  })

  it('should return the same state from getOrCreateResource', () => {
    const resource1 = getOrCreateResource(instance, testResource)
    const resource2 = getOrCreateResource(instance, testResource)
    expect(resource1).toBe(resource2)
  })

  it('should initialize a resource with initial state', () => {
    const initialState = {value: 1}
    const resource = createResource<TestState>({
      name: 'test',
      getInitialState: () => initialState,
    })

    const {state} = initializeResource(instance, resource)
    expect(state.get()).toEqual(initialState)
  })

  it('should invoke the init function on initialization', () => {
    const resource = createResource<TestState>({
      name: 'test',
      getInitialState: () => ({value: 0}),
      initialize: vi.fn(),
    })

    initializeResource(instance, resource)
    expect(resource.initialize).toHaveBeenCalledTimes(1)
  })

  it('should update the state using set method', () => {
    const resource = createResource<TestState>({
      name: 'test',
      getInitialState: () => ({value: 0}),
    })

    const {state} = initializeResource(instance, resource)
    state.set('increment', (prevState) => ({value: prevState.value + 1}))
    expect(state.get()).toEqual({value: 1})
  })

  it('should create an observable from the state', () => {
    const resource = createResource<TestState>({
      name: 'test',
      getInitialState: () => ({value: 0}),
    })
    const {state} = initializeResource(instance, resource)
    const next = vi.fn()
    state.observable.subscribe(next)
    state.set('increment', (prevState) => ({value: prevState.value + 1}))
    expect(next).toHaveBeenCalledTimes(2) // inital and updated
    expect(next).toHaveBeenLastCalledWith({value: 1})
  })

  it('should return a disposable object with a dispose function', () => {
    const resource = createResource<TestState>({
      name: 'test',
      getInitialState: () => ({value: 0}),
      initialize: vi.fn(() => vi.fn()),
    })

    const {dispose} = initializeResource(instance, resource)
    dispose()
    expect(resource.initialize).toHaveReturnedWith(expect.any(Function))
    expect(resource.initialize).toHaveBeenCalledTimes(1)
  })

  it('should not throw when no dispose function is supplied', () => {
    const resource = createResource<TestState>({
      name: 'test',
      getInitialState: () => ({value: 0}),
    })
    const {dispose} = initializeResource(instance, resource)
    expect(() => dispose()).not.toThrowError()
  })

  it('should clear resource caqche on disposeResources', () => {
    const resource = createResource<TestState>({
      name: 'test',
      getInitialState: () => ({value: 0}),
    })

    getOrCreateResource(instance, resource)
    disposeResources(instance.resources)

    const {state} = initializeResource(instance, resource)

    expect(state.get()).toEqual({value: 0})
  })
})
