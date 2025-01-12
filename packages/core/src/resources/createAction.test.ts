import {describe, expect, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {type ActionContext, createAction, createInternalAction} from './createAction'
import {createResource, createResourceState} from './createResource'

const instance = createSanityInstance({projectId: 'test', dataset: 'test'})

interface TestState {
  value: number
}

const testResource = createResource<TestState>({
  name: 'test',
  getInitialState: () => ({value: 0}),
  initialize() {
    return () => {}
  },
})

describe('createAction', () => {
  it('should create an action that can access state and instance', () => {
    // Define an action that accesses state and instance
    const testAction = createAction(
      () => testResource,
      ({state, instance: {identity}}) => {
        return function () {
          state.set('increment', (prev) => ({value: prev.value + 1}))
          return identity.projectId
        }
      },
    )

    // Call the action with instance
    const result = testAction(instance)

    // Verify that the state and instance are correctly passed into the action
    expect(result).toBe('test')
    expect(createResourceState({value: 0}).get()).toEqual({value: 0})
  })

  it('should correctly update the state using set', () => {
    const testAction = createAction(
      () => testResource,
      ({state, instance: {identity}}) => {
        return function () {
          state.set('increment', (prev) => ({value: prev.value + 1}))
          return identity.projectId
        }
      },
    )

    const state = createResourceState({value: 1})
    const actionContext: ActionContext<TestState> = {instance, state}

    // call the action with state
    const projectId = testAction(actionContext)
    expect(projectId).toBe(instance.identity.projectId)

    // Verify that the state has been changed
    expect(state.get()).toEqual({value: 2})
  })

  it('should bind the action to a provided context and work without instance', () => {
    const testAction = createAction(
      () => testResource,
      ({state}) => {
        return function (value: number) {
          state.set('updateValue', {value: value})
          return state.get().value
        }
      },
    )

    const mockState = createResourceState({value: 10})
    const result = testAction(
      {state: mockState, instance: instance} as ActionContext<TestState>,
      20,
    )

    expect(result).toBe(20)
    expect(mockState.get()).toEqual({value: 20})

    const mockState2 = createResourceState({value: 10})
    const result2 = testAction({state: mockState2} as ActionContext<TestState>, 30)
    expect(result2).toBe(30)
    expect(mockState2.get()).toEqual({value: 30})
  })
})

describe('createInternalAction', () => {
  it('creates an action that requires state and instance', () => {
    // Define an action that accesses state and instance
    const testAction = createInternalAction<TestState, [], string>(
      ({state, instance: {identity}}) => {
        return function () {
          state.set('increment', (prev) => ({value: prev.value + 1}))
          return identity.projectId
        }
      },
    )

    const result = testAction({
      state: createResourceState({value: 10}),
      instance: instance,
    } as ActionContext<TestState>)

    expect(result).toBe('test')
  })
})
