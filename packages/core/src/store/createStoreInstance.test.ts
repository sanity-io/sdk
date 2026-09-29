import {Subscription} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from './createSanityInstance'
import {createStoreInstance, UPSTREAM_CLOSE_DELAY_MS} from './createStoreInstance'
import {type StoreDefinition} from './defineStore'

describe('createStoreInstance', () => {
  let instance: ReturnType<typeof createSanityInstance>

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
  })

  const storeDef: StoreDefinition<{count: number}> = {
    name: 'TestStore',
    getInitialState: (inst) => ({
      count: inst.config.projectId === 'test' ? 0 : -1,
    }),
  }

  it('should create store instance with initial state', () => {
    const store = createStoreInstance(instance, {name: 'store'}, storeDef)
    expect(store.state).toBeDefined()
  })

  it('should call getInitialState with Sanity instance', () => {
    const getInitialState = vi.fn(() => ({count: 0}))
    createStoreInstance(instance, {name: 'store'}, {...storeDef, getInitialState})
    expect(getInitialState).toHaveBeenCalledWith(instance, {name: 'store'})
  })

  it('should call initialize function with context', () => {
    const initialize = vi.fn()

    const store = createStoreInstance(
      instance,
      {name: 'store'},
      {
        ...storeDef,
        initialize,
      },
    )
    expect(initialize).toHaveBeenCalledWith({
      state: store.state,
      instance,
      key: {name: 'store'},
    })
  })

  it('should handle store disposal with cleanup function', () => {
    const disposeMock = vi.fn()

    const store = createStoreInstance(
      instance,
      {name: 'store'},
      {
        ...storeDef,
        initialize: () => disposeMock,
      },
    )
    store.dispose()

    expect(disposeMock).toHaveBeenCalledTimes(1)
    expect(store.isDisposed()).toBe(true)
  })

  it('should handle disposal without initialize function', () => {
    const store = createStoreInstance(instance, {name: 'store'}, storeDef)
    store.dispose()
    expect(store.isDisposed()).toBe(true)
  })

  it('should prevent multiple disposals', () => {
    const disposeMock = vi.fn()

    const store = createStoreInstance(
      instance,
      {name: 'store'},
      {
        ...storeDef,
        initialize: () => disposeMock,
      },
    )
    store.dispose()
    store.dispose()

    expect(disposeMock).toHaveBeenCalledTimes(1)
  })

  describe('upstream', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const setup = () => {
      const close = vi.fn()
      const upstream = vi.fn(() => new Subscription(close))
      const store = createStoreInstance(instance, {name: 'store'}, {...storeDef, upstream})
      return {store, upstream, close}
    }

    it('opens on the first subscriber and closes after the last one leaves', () => {
      const {store, upstream, close} = setup()
      expect(upstream).not.toHaveBeenCalled()

      const a = store.upstream$.subscribe()
      const b = store.upstream$.subscribe()
      expect(upstream).toHaveBeenCalledTimes(1)
      expect(upstream).toHaveBeenCalledWith({state: store.state, instance, key: {name: 'store'}})

      a.unsubscribe()
      b.unsubscribe()
      vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS - 1)
      expect(close).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(close).toHaveBeenCalledTimes(1)
    })

    it('stays open when subscribed again before it closes', () => {
      const {store, upstream, close} = setup()
      store.upstream$.subscribe().unsubscribe()
      vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS - 1)
      const subscription = store.upstream$.subscribe()
      vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS * 2)
      expect(close).not.toHaveBeenCalled()
      expect(upstream).toHaveBeenCalledTimes(1)

      subscription.unsubscribe()
      vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS)
      expect(close).toHaveBeenCalledTimes(1)
    })

    it('opens again when subscribed after it closed', () => {
      const {store, upstream, close} = setup()
      store.upstream$.subscribe().unsubscribe()
      vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS)
      store.upstream$.subscribe()
      expect(close).toHaveBeenCalledTimes(1)
      expect(upstream).toHaveBeenCalledTimes(2)
    })

    it('errors the subscriber when opening throws, and opens again on the next subscriber', () => {
      const {store, upstream, close} = setup()
      upstream.mockImplementationOnce(() => {
        throw new Error('Unable to determine presence URL')
      })
      const error = vi.fn()
      store.upstream$.subscribe({error})
      expect(error).toHaveBeenCalledWith(new Error('Unable to determine presence URL'))

      store.upstream$.subscribe().unsubscribe()
      vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS)
      expect(upstream).toHaveBeenCalledTimes(2)
      expect(close).toHaveBeenCalledTimes(1)
    })

    it('closes immediately on dispose and does not open again', () => {
      const {store, upstream, close} = setup()
      const complete = vi.fn()
      store.upstream$.subscribe({complete})
      store.dispose()
      expect(close).toHaveBeenCalledTimes(1)
      expect(complete).toHaveBeenCalledTimes(1)

      store.upstream$.subscribe()
      vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS)
      expect(upstream).toHaveBeenCalledTimes(1)
    })

    it('does not open after dispose when nothing was subscribed', () => {
      const {store, upstream} = setup()
      store.dispose()
      store.upstream$.subscribe()
      expect(upstream).not.toHaveBeenCalled()
    })
  })
})
