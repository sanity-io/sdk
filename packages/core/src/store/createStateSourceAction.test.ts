import {filter, firstValueFrom, Observable, share, Subscription, timeout} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {bindActionGlobally} from './createActionBinder'
import {createSanityInstance, type SanityInstance} from './createSanityInstance'
import {createStateSourceAction, type SelectorContext} from './createStateSourceAction'
import {UPSTREAM_CLOSE_DELAY_MS} from './createStoreInstance'
import {createStoreState, type StoreState} from './createStoreState'
import {defineStore} from './defineStore'

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
    const source = action({state, instance, key: null})

    expect(source.getCurrent()).toBe(0)
    state.set('test', {count: 5})
    expect(source.getCurrent()).toBe(5)
  })

  it('should call onStoreChanged when state changes', () => {
    const onStoreChanged = vi.fn()
    const source = createStateSourceAction({
      selector: ({state: s}: SelectorContext<CountStoreState>) => s.count,
      isEqual: (a, b) => a === b,
    })({state, instance, key: null})

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
    })({state, instance, key: null})

    const unsubscribe = source.subscribe()
    expect(onSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({state, instance, key: null}),
      // No params in this case
    )

    unsubscribe()
  })

  it('should support parameterized selectors', () => {
    const action = createStateSourceAction({
      selector: ({state: s}: SelectorContext<CountStoreState>, index: number) => s.items[index],
    })
    const source = action({state, instance, key: null}, 0)

    state.set('add', {items: ['first']})
    expect(source.getCurrent()).toBe('first')
  })

  it('should handle selector errors in observable', () => {
    const error = new Error('Selector failed')
    const source = createStateSourceAction({
      selector: () => {
        throw error
      },
    })({state, instance, key: null})

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
    })({state, instance, key: null})

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
    })({state, instance, key: null})

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
      key: null,
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
    const source = createStateSourceAction(selector)({state, instance, key: null})

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

    const source1 = createStateSourceAction(selector)({state, instance, key: null})
    source1.getCurrent()

    const source2 = createStateSourceAction(selector)({state, instance: secondInstance, key: null})
    source2.getCurrent()

    const context1 = selector.mock.calls[0][0]
    const context2 = selector.mock.calls[1][0]
    expect(context1).not.toBe(context2)
    expect(context1.instance).toBe(instance)
    expect(context2.instance).toBe(secondInstance)
  })

  it('correctly observes values defined in the onSubscribe', async () => {
    const selector = vi.fn(({state: s}: SelectorContext<CountStoreState>) => s.count)
    const source = createStateSourceAction({
      selector: selector,
      onSubscribe() {
        state.set('update', {count: 1})
      },
    })({state, instance, key: null})

    const value = await firstValueFrom(
      source.observable.pipe(
        filter((i) => i === 1),
        timeout(10),
      ),
    )
    expect(value).toBe(1)
  })

  it('only invokes selector once on changes', () => {
    const selector = vi.fn(({state: s}: SelectorContext<CountStoreState>) => s.count)
    const source = createStateSourceAction({selector: selector})({state, instance, key: null})

    expect(selector).toBeCalledTimes(0)

    // Now it should be called once:
    const sub = source.observable.subscribe()
    expect(selector).toBeCalledTimes(1)

    // The observable should be shared so this shouldn't invoke it first.
    const sub2 = source.observable.subscribe()
    expect(selector).toBeCalledTimes(1)

    // Updating the value should only invoke it once:
    state.set('update', {count: 1})
    expect(selector).toBeCalledTimes(2)

    sub2.unsubscribe()
    sub.unsubscribe()

    // Once everyone has unsubscribed it should be invoked again.
    const sub3 = source.observable.subscribe()
    expect(selector).toBeCalledTimes(3)
    sub3.unsubscribe()
  })

  it('only subscribes once when mixing subscribe/observable', () => {
    const selector = vi.fn(({state: s}: SelectorContext<CountStoreState>) => s.count)
    const source = createStateSourceAction({selector: selector})({state, instance, key: null})

    expect(selector).toBeCalledTimes(0)

    const sub = source.observable.subscribe()
    expect(selector).toBeCalledTimes(1)

    const sub2 = source.subscribe()
    expect(selector).toBeCalledTimes(1)

    sub.unsubscribe()
    sub2()
  })

  it('keeps the store upstream open for as long as it has subscribers', () => {
    const open = vi.fn()
    const close = vi.fn()
    const upstream$ = new Observable<never>(() => {
      open()
      return close
    }).pipe(share())
    const source = createStateSourceAction(
      ({state: s}: SelectorContext<CountStoreState>) => s.count,
    )({state, instance, key: null, upstream$})

    const unsubscribeA = source.subscribe()
    const subscriptionB = source.observable.subscribe()
    expect(open).toHaveBeenCalledTimes(1)

    unsubscribeA()
    expect(close).not.toHaveBeenCalled()
    subscriptionB.unsubscribe()
    expect(close).toHaveBeenCalledTimes(1)
  })

  describe('when the store upstream fails to open', () => {
    const upstream = vi.fn<() => Subscription>()
    const failingStore = defineStore<CountStoreState>({
      name: 'failing-upstream',
      getInitialState: () => ({count: 0, items: []}),
      upstream,
    })
    const getCount = bindActionGlobally(
      failingStore,
      createStateSourceAction(({state: s}: SelectorContext<CountStoreState>) => s.count),
    )

    beforeEach(() => {
      upstream.mockReset().mockImplementation(() => {
        throw new Error('open failed')
      })
    })
    afterEach(() => {
      instance.dispose()
      vi.useRealTimers()
    })

    it('throws the error from getCurrent after notifying subscribers, so it reaches an error boundary', () => {
      const source = getCount(instance)
      const onStoreChanged = vi.fn()
      source.subscribe(onStoreChanged)

      expect(onStoreChanged).toHaveBeenCalledTimes(1)
      expect(() => source.getCurrent()).toThrow('open failed')
    })

    it('throws it from every source on the store, including ones created after the failure', () => {
      getCount(instance).subscribe()

      expect(() => getCount(instance).getCurrent()).toThrow('open failed')
    })

    it('opens again on the next mount after an error boundary unmounted the subscriber', () => {
      vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
      const unsubscribe = getCount(instance).subscribe(vi.fn())
      unsubscribe()
      upstream.mockImplementation(() => new Subscription())
      vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS)

      const remounted = getCount(instance)
      // React reads the snapshot during render, before it subscribes
      expect(remounted.getCurrent()).toBe(0)
      remounted.subscribe()
      expect(upstream).toHaveBeenCalledTimes(2)
    })

    it('opens again on the next mount when the error reached a reader through the observable', () => {
      vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
      // How a suspending hook reads: `firstValueFrom(source.observable)`, never `subscribe()`
      getCount(instance).observable.subscribe({error: () => {}})
      upstream.mockImplementation(() => new Subscription())
      vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS)

      const remounted = getCount(instance)
      expect(remounted.getCurrent()).toBe(0)
      remounted.subscribe()
      expect(upstream).toHaveBeenCalledTimes(2)
    })

    it('keeps throwing for a subscriber still attached when another one leaves', () => {
      const unsubscribeA = getCount(instance).subscribe(vi.fn())
      const b = getCount(instance)
      b.subscribe(vi.fn())

      unsubscribeA()
      expect(() => b.getCurrent()).toThrow('open failed')
    })

    it('throws even when the upstream throws undefined', () => {
      upstream.mockImplementation(() => {
        throw undefined
      })
      const source = getCount(instance)
      source.subscribe(vi.fn())

      expect(() => source.getCurrent()).toThrow()
    })

    it('stops throwing once a later subscriber opens it successfully', () => {
      getCount(instance).subscribe()
      expect(() => getCount(instance).getCurrent()).toThrow('open failed')
      upstream.mockImplementation(() => new Subscription())

      const source = getCount(instance)
      source.observable.subscribe()
      expect(source.getCurrent()).toBe(0)
    })
  })
})
