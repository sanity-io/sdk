import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from './createSanityInstance'
import {createStateSourceAction, type SelectorContext} from './createStateSourceAction'
import {createStoreState, type StoreState} from './createStoreState'

interface CountStoreState {
  count: number
  items: string[]
}

describe('createStateSourceAction', () => {
  let state: StoreState<CountStoreState>
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    state = createStoreState({count: 0, items: [] as string[]}, {name: 'test-store'})
  })

  it('should create a source that provides current state through getCurrent', () => {
    const selector = vi.fn(({state: s}: SelectorContext<CountStoreState>) => s.count)
    const action = createStateSourceAction(selector)
    const source = action({state, instance})

    expect(source.getCurrent()).toBe(0)
    state.set('test', {count: 5})
    expect(source.getCurrent()).toBe(5)
  })

  it('should call onStoreChanged when state changes', () => {
    const onStoreChanged = vi.fn()
    const source = createStateSourceAction({
      selector: ({state: s}: SelectorContext<CountStoreState>) => s.count,
      isEqual: (a, b) => a === b,
    })({state, instance})

    const unsubscribe = source.subscribe(onStoreChanged)

    state.set('inc', (s) => ({count: s.count + 1}))
    expect(onStoreChanged).toHaveBeenCalledTimes(1)

    state.set('noop', (s) => s)
    expect(onStoreChanged).toHaveBeenCalledTimes(1) // No change

    unsubscribe()
    state.set('inc2', (s) => ({count: s.count + 1}))
    expect(onStoreChanged).toHaveBeenCalledTimes(1)
  })

  it('should call onSubscribe handler when subscription starts', () => {
    const onSubscribe = vi.fn(() => () => {})
    const source = createStateSourceAction({
      selector: ({state: s}: SelectorContext<CountStoreState>) => s.items,
      onSubscribe,
    })({state, instance})

    const unsubscribe = source.subscribe()
    expect(onSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({state, instance}),
      // No params in this case
    )

    unsubscribe()
  })

  it('should support parameterized selectors', () => {
    const action = createStateSourceAction({
      selector: ({state: s}: SelectorContext<CountStoreState>, index: number) => s.items[index],
    })
    const source = action({state, instance}, 0)

    state.set('add', {items: ['first']})
    expect(source.getCurrent()).toBe('first')
  })

  it('should handle selector errors in observable', () => {
    const error = new Error('Selector failed')
    const source = createStateSourceAction({
      selector: () => {
        throw error
      },
    })({state, instance})

    const errorHandler = vi.fn()
    source.observable.subscribe({error: errorHandler})

    state.set('trigger', {count: 1})
    expect(errorHandler).toHaveBeenCalledWith(error)
  })

  it('should use custom equality check', () => {
    const isEqual = vi.fn((a: number[], b: number[]) => a.length === b.length)
    const source = createStateSourceAction({
      selector: ({state: s}: SelectorContext<CountStoreState>) => s.items.map((i) => i.length),
      isEqual,
    })({state, instance})

    const onChange = vi.fn()
    source.subscribe(onChange)

    // Same length, different contents
    state.set('add1', {items: ['a']})
    state.set('add2', {items: ['b']})

    expect(isEqual).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledTimes(1) // Only first change
  })

  it('should cleanup onSubscribe when unsubscribed', () => {
    const cleanup = vi.fn()
    const source = createStateSourceAction({
      selector: ({state: s}: SelectorContext<CountStoreState>) => s.count,
      onSubscribe: () => cleanup,
    })({state, instance})

    const unsubscribe = source.subscribe()
    unsubscribe()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('should share observable between subscribers', () => {
    const source = createStateSourceAction(
      ({state: s}: SelectorContext<CountStoreState>) => s.count,
    )({
      state,
      instance,
    })

    const subscriber1 = vi.fn()
    const subscriber2 = vi.fn()

    const subscription1 = source.observable.subscribe(subscriber1)
    const subscription2 = source.observable.subscribe(subscriber2)

    state.set('inc', {count: 1})

    expect(subscriber1).toHaveBeenCalledWith(1)
    expect(subscriber2).toHaveBeenCalledWith(1)

    subscription1.unsubscribe()
    subscription2.unsubscribe()
  })

  it('should cache selector context per state object', () => {
    const selector = vi.fn(({state: s}: SelectorContext<CountStoreState>) => s.count)
    const source = createStateSourceAction(selector)({state, instance})

    // Initial call creates context
    expect(source.getCurrent()).toBe(0)
    expect(selector).toHaveBeenCalledTimes(1)
    const firstContext = selector.mock.calls[0][0]

    // Subsequent call with same state reuses context
    expect(source.getCurrent()).toBe(0)
    expect(selector).toHaveBeenCalledTimes(2)
    expect(selector.mock.calls[1][0]).toBe(firstContext)

    // After state change, new context is created
    state.set('update1', {count: 1})
    expect(source.getCurrent()).toBe(1)
    expect(selector).toHaveBeenCalledTimes(3)
    const secondContext = selector.mock.calls[2][0]
    expect(secondContext).not.toBe(firstContext)

    // Another call with same state reuses new context
    expect(source.getCurrent()).toBe(1)
    expect(selector).toHaveBeenCalledTimes(4)
    expect(selector.mock.calls[3][0]).toBe(secondContext)

    // State change again, new context
    state.set('update2', {count: 2})
    expect(source.getCurrent()).toBe(2)
    expect(selector).toHaveBeenCalledTimes(5)
    const thirdContext = selector.mock.calls[4][0]
    expect(thirdContext).not.toBe(secondContext)
  })

  // New test: distinct contexts for same state with different instance
  it('should create distinct contexts for same state with different instance', () => {
    const secondInstance = createSanityInstance({projectId: 'test2', dataset: 'test2'})
    const selector = vi.fn(({state: s}: SelectorContext<CountStoreState>) => s.count)

    const source1 = createStateSourceAction(selector)({state, instance})
    source1.getCurrent()

    const source2 = createStateSourceAction(selector)({state, instance: secondInstance})
    source2.getCurrent()

    const context1 = selector.mock.calls[0][0]
    const context2 = selector.mock.calls[1][0]
    expect(context1).not.toBe(context2)
    expect(context1.instance).toBe(instance)
    expect(context2.instance).toBe(secondInstance)
  })
})
