import {describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createAction} from './createAction'
import {createResource, createResourceState} from './createResource'
import {createStore} from './createStore'

describe('createStore', () => {
  const mockInstance = createSanityInstance({projectId: 'test', dataset: 'test'})

  interface TestState {
    value: number
  }

  const testResource = createResource<TestState>({
    name: 'test',
    getInitialState: () => ({value: 0}),
    initialize: vi.fn(),
  })

  const incrementAction = createAction(
    () => testResource,
    ({state}) => {
      return function () {
        state.set('increment', (prevState) => ({value: prevState.value + 1}))
      }
    },
  )

  const setAction = createAction(
    () => testResource,
    ({state}) => {
      return function (value: number) {
        state.set('setValue', {value})
      }
    },
  )

  it('should return a store with bound actions and a dispose function', () => {
    const store = createStore(testResource, {incrementAction, setAction})
    const instanceStore = store(mockInstance)

    expect(instanceStore).toHaveProperty('dispose')
    expect(instanceStore).toHaveProperty('incrementAction')
    expect(instanceStore).toHaveProperty('setAction')
  })

  it('should bind the actions with state and instance from the sanity instance', () => {
    const store = createStore(testResource, {incrementAction, setAction})
    const instanceStore = store(mockInstance)

    instanceStore.incrementAction()
    const state = createResourceState<TestState>({value: 0})
    const instanceStore2 = store(mockInstance)
    instanceStore2.setAction(10)

    expect(state.get()).toEqual({value: 0})
    expect(instanceStore2.setAction).toBeDefined()
  })

  it('should dispose of the resource', () => {
    const resource = createResource<TestState>({
      name: 'test',
      getInitialState: () => ({value: 0}),
      initialize: vi.fn(() => vi.fn()),
    })
    const store = createStore(resource, {})
    const instanceStore = store(mockInstance)
    instanceStore.dispose()
    expect(resource.initialize).toHaveBeenCalledTimes(1)
    expect(resource.initialize).toHaveReturnedWith(expect.any(Function))
  })
})
