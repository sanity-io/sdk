import {describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createAction} from './createAction'
import {createResource} from './createResource'
import {createStateSourceAction} from './createStateSourceAction'

describe('createStateSourceAction', () => {
  const resource = createResource({
    name: 'testResource',
    getInitialState: () => ({value: 10}),
  })

  const getValue = createAction(
    () => resource,
    ({state}) => {
      return function () {
        return state.get().value
      }
    },
  )

  const setValue = createAction(
    () => resource,
    ({state}) => {
      return function (value: number) {
        state.set('updateValue', {value})
      }
    },
  )

  const getValueSource = createStateSourceAction(() => resource, getValue)

  it('should return the current value', () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const valueSource = getValueSource(instance)

    expect(valueSource.getCurrent()).toBe(10)
  })

  it('should subscribe to state changes and call the provided function', () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const valueSource = getValueSource(instance)

    const mockCallback = vi.fn()
    valueSource.subscribe(mockCallback)

    setValue(instance, 5)

    expect(mockCallback).toHaveBeenCalledTimes(1)
  })

  it('should unsubscribe from the state changes', () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const valueSource = getValueSource(instance)
    const mockCallback = vi.fn()

    const unsubscribe = valueSource.subscribe(mockCallback)
    unsubscribe()

    setValue(instance, 5)
    expect(mockCallback).toHaveBeenCalledTimes(0)
  })

  it('should emit only when the value actually changes', () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const valueSource = getValueSource(instance)

    const mockCallback = vi.fn()
    valueSource.subscribe(mockCallback)

    setValue(instance, getValue(instance))
    expect(mockCallback).toHaveBeenCalledTimes(0)

    setValue(instance, 5)
    expect(mockCallback).toHaveBeenCalledTimes(1)
  })

  it('returns an observable that emits the current value on subscribe', () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const valueSource = getValueSource(instance)

    const observer = vi.fn()
    const subscription = valueSource.observable.subscribe(observer)

    expect(observer).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenCalledWith(10)

    // try a no-op change
    setValue(instance, getValue(instance))
    expect(observer).toHaveBeenCalledTimes(1)

    // set a value that will change
    setValue(instance, 5)
    expect(observer).toHaveBeenCalledTimes(2)

    subscription.unsubscribe()
  })
})
