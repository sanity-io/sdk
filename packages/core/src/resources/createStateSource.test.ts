import {describe, expect, it, vi} from 'vitest'

import {createResourceState} from './createResource'
import {createObservableFromStateSource, createStateSource} from './createStateSource'

describe('createStateSource', () => {
  it('should return the current value', () => {
    const state = createResourceState({value: 10})
    const source = createStateSource(state, () => state.get().value)
    expect(source.getCurrent()).toBe(10)
  })

  it('should subscribe to state changes and call the provided function', () => {
    const state = createResourceState({value: 0})
    const source = createStateSource(state, () => state.get().value)
    const mockCallback = vi.fn()
    source.subscribe(mockCallback)

    state.set('increment', (prevState) => ({value: prevState.value + 1}))
    expect(mockCallback).toHaveBeenCalledTimes(1)
  })

  it('should unsubscribe from the state changes', () => {
    const state = createResourceState({value: 0})
    const source = createStateSource(state, () => state.get().value)
    const mockCallback = vi.fn()
    const unsubscribe = source.subscribe(mockCallback)

    unsubscribe()
    state.set('increment', (prevState) => ({value: prevState.value + 1}))
    expect(mockCallback).toHaveBeenCalledTimes(0)
  })

  it('should emit only when the value actually changes', () => {
    const state = createResourceState({value: 0})
    const source = createStateSource(state, () => state.get().value)

    const mockCallback = vi.fn()
    source.subscribe(mockCallback)

    state.set('doNotIncrement', {value: 0})
    expect(mockCallback).toHaveBeenCalledTimes(0)

    state.set('increment', (prev) => ({value: prev.value + 1}))
    expect(mockCallback).toHaveBeenCalledTimes(1)
  })
})

describe('createObservableFromStateSource', () => {
  it('should create an observable that emits current value', () => {
    const state = createResourceState({value: 0})
    const source = createStateSource(state, () => state.get().value)
    const observable = createObservableFromStateSource(source)
    const mockNext = vi.fn()
    observable.subscribe({next: mockNext})
    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockNext).toHaveBeenLastCalledWith(0)
  })

  it('should emit updates from state changes', () => {
    const state = createResourceState({value: 0})
    const source = createStateSource(state, () => state.get().value)
    const observable = createObservableFromStateSource(source)
    const mockNext = vi.fn()
    observable.subscribe({next: mockNext})
    state.set('increment', (prev) => ({value: prev.value + 1}))
    expect(mockNext).toHaveBeenCalledTimes(2)
    expect(mockNext).toHaveBeenLastCalledWith(1)
  })
})
