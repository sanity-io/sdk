import {describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createAction} from './createAction'
import {createResource} from './createResource'
import {createStateSourceAction} from './createStateSourceAction'

describe('createStateSourceAction', () => {
  const resource = createResource({
    name: 'testResource',
    getInitialState: () => ({value: 10, subscribed: false}),
  })

  const setValue = createAction(resource, ({state}) => {
    return function (value: number) {
      state.set('updateValue', {value})
    }
  })

  const getValueState = createStateSourceAction(resource, {
    selector: (state) => state.value,
    onSubscribe: ({state}) => {
      state.set('setSubscribedTrue', {subscribed: true})

      return () => {
        state.set('setSubscribedFalse', {subscribed: false})
      }
    },
  })

  const getSubscribed = createAction(resource, ({state}) => {
    return function () {
      return state.get().subscribed
    }
  })

  it('should return the current value', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
    })
    const valueState = getValueState(instance)

    expect(valueState.getCurrent()).toBe(10)
  })

  it('should subscribe to state changes and call the provided function', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
    })
    const valueState = getValueState(instance)

    const mockCallback = vi.fn()
    valueState.subscribe(mockCallback)

    setValue(instance, 5)

    expect(mockCallback).toHaveBeenCalledTimes(1)
  })

  it('should unsubscribe from the state changes', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
    })
    const valueState = getValueState(instance)
    const mockCallback = vi.fn()

    const unsubscribe = valueState.subscribe(mockCallback)
    unsubscribe()

    setValue(instance, 5)
    expect(mockCallback).toHaveBeenCalledTimes(0)
  })

  it('should emit only when the value actually changes', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
    })
    const valueState = getValueState(instance)

    const mockCallback = vi.fn()
    valueState.subscribe(mockCallback)

    setValue(instance, valueState.getCurrent())
    expect(mockCallback).toHaveBeenCalledTimes(0)

    setValue(instance, 5)
    expect(mockCallback).toHaveBeenCalledTimes(1)
  })

  it('returns an observable that emits the current value on subscribe', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
    })
    const valueState = getValueState(instance)

    const observer = vi.fn()
    const subscription = valueState.observable.subscribe(observer)

    expect(observer).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenCalledWith(10)

    // try a no-op change
    setValue(instance, valueState.getCurrent())
    expect(observer).toHaveBeenCalledTimes(1)

    // set a value that will change
    setValue(instance, 5)
    expect(observer).toHaveBeenCalledTimes(2)

    subscription.unsubscribe()
  })

  it('allows providing an `onSubscribe` handler', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
    })
    const valueState = getValueState(instance)

    expect(getSubscribed(instance)).toBe(false)
    const unsubscribe = valueState.subscribe()
    expect(getSubscribed(instance)).toBe(true)

    unsubscribe()
    expect(getSubscribed(instance)).toBe(false)
  })
})
