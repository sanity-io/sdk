import {firstValueFrom} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {createStoreState} from './createStoreState'

describe('createStoreState', () => {
  it('should initialize with correct state', () => {
    const store = createStoreState({count: 0, items: []})
    expect(store.get()).toEqual({count: 0, items: []})
  })

  it('should update state with set()', () => {
    const store = createStoreState({count: 0})
    store.set('increment', {count: 1})
    expect(store.get()).toEqual({count: 1})
  })

  it('should not update state if new value is identical', () => {
    const store = createStoreState({count: 0})
    const originalState = store.get()
    store.set('noop', originalState)
    expect(store.get()).toBe(originalState) // Reference equality check
  })

  it('should support functional updates', () => {
    const store = createStoreState({count: 0})
    store.set('increment', (prev) => ({count: prev.count + 1}))
    expect(store.get()).toEqual({count: 1})
  })

  it('should emit initial state through observable', async () => {
    const store = createStoreState({count: 42})
    const value = await firstValueFrom(store.observable)
    expect(value).toEqual({count: 42})
  })

  it('should emit state changes through observable', async () => {
    const store = createStoreState({count: 0})
    const emissions: number[] = []

    const sub = store.observable.subscribe((state) => {
      emissions.push(state.count)
    })

    store.set('inc1', {count: 1})
    store.set('inc2', {count: 2})
    sub.unsubscribe()

    expect(emissions).toEqual([0, 1, 2])
  })

  it('should share observable between subscribers', () => {
    const store = createStoreState({count: 0})
    const sub1 = vi.fn()
    const sub2 = vi.fn()

    const subscription1 = store.observable.subscribe(sub1)
    const subscription2 = store.observable.subscribe(sub2)

    store.set('inc', {count: 1})

    expect(sub1).toHaveBeenCalledWith({count: 1})
    expect(sub2).toHaveBeenCalledWith({count: 1})

    subscription1.unsubscribe()
    subscription2.unsubscribe()
  })

  it('should handle multiple subscribers independently', () => {
    const store = createStoreState({count: 0})
    const sub1 = vi.fn()
    const sub2 = vi.fn()

    const subscription1 = store.observable.subscribe(sub1)
    store.set('inc1', {count: 1})
    const subscription2 = store.observable.subscribe(sub2)
    store.set('inc2', {count: 2})

    expect(sub1.mock.calls).toEqual([[{count: 0}], [{count: 1}], [{count: 2}]])
    expect(sub2.mock.calls).toEqual([[{count: 1}], [{count: 2}]])

    subscription1.unsubscribe()
    subscription2.unsubscribe()
  })
})
