import {delay, firstValueFrom, of, throwError} from 'rxjs'
import {filter, skip} from 'rxjs/operators'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {createFetcherStore} from './createFetcherStore'

describe('createFetcherStore', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    vi.useRealTimers()
  })

  afterEach(() => {
    instance.dispose()
  })

  it('should fetch data and update state when subscribed', async () => {
    const store = createFetcherStore({
      name: 'test',
      fetcher: () => (param: number) => of(`data-${param}`).pipe(delay(100)),
      getKey: (_instance, param: number) => `key-${param}`,
    })

    const stateSource = store.getState(instance, 1)
    const dataPromise = firstValueFrom(
      stateSource.observable.pipe(filter((data) => data !== undefined)),
    )

    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(100)
    const data = await dataPromise
    expect(data).toBe('data-1')
    vi.useRealTimers()

    expect(stateSource.getCurrent()).toBe('data-1')
  })

  it('should only fetch once for multiple subscriptions within throttle interval', async () => {
    const fetchSpy = vi.fn().mockImplementation((param: number) => of(`data-${param}`))
    const store = createFetcherStore({
      name: 'test-throttle',
      fetcher: () => fetchSpy,
      getKey: (_instance, param: number) => `key-${param}`,
      fetchThrottleInternal: 1000,
    })

    const stateSource = store.getState(instance, 1)
    const sub1 = stateSource.subscribe()
    const sub2 = stateSource.subscribe()

    await firstValueFrom(stateSource.observable)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    sub1()
    sub2()
  })

  it('should propagate errors correctly', async () => {
    const store = createFetcherStore({
      name: 'test-error',
      fetcher: () => () => throwError(() => new Error('test error')),
      getKey: () => 'key',
    })

    const stateSource = store.getState(instance)
    const dataPromise = firstValueFrom(
      stateSource.observable.pipe(
        // the first value will be `undefined` since the store is not populated
        skip(1),
      ),
    )

    await expect(dataPromise).rejects.toThrow()
    expect(() => stateSource.getCurrent()).toThrow()
  })

  it('should clear state after expiration delay', async () => {
    const fetchSpy = vi
      .fn()
      .mockImplementation((param: number) => of(`data-${param}`).pipe(delay(100)))
    const store = createFetcherStore({
      name: 'test-expiration',
      fetcher: () => fetchSpy,
      getKey: (_instance, param: number) => `key-${param}`,
      stateExpirationDelay: 1000,
    })

    // First subscription
    const stateSource1 = store.getState(instance, 1)
    const sub1 = stateSource1.subscribe()
    await firstValueFrom(stateSource1.observable.pipe(filter((data) => data !== undefined)))
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    sub1()

    // Wait for expiration delay
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(1000)

    // Second subscription
    const stateSource2 = store.getState(instance, 1)
    const sub2 = stateSource2.subscribe()
    await firstValueFrom(stateSource2.observable.pipe(filter((data) => data !== undefined)))
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    sub2()
    vi.useRealTimers()
  })

  it('should throttle fetches based on fetchThrottleInternal', async () => {
    const fetchSpy = vi.fn().mockImplementation((param: number) => of(`data-${param}`))
    const store = createFetcherStore({
      name: 'test-throttle',
      fetcher: () => fetchSpy,
      getKey: (_instance, param: number) => `key-${param}`,
      fetchThrottleInternal: 1000,
    })

    const stateSource = store.getState(instance, 1)

    // First subscription
    const sub1 = stateSource.subscribe()
    await firstValueFrom(stateSource.observable)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Second subscription within throttle interval
    const sub2 = stateSource.subscribe()
    await firstValueFrom(stateSource.observable)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Advance past throttle interval
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(1000)

    // Third subscription after throttle interval
    const sub3 = stateSource.subscribe()
    await firstValueFrom(stateSource.observable)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    sub1()
    sub2()
    sub3()
    vi.useRealTimers()
  })

  it('should handle different parameters with different keys', async () => {
    const store = createFetcherStore({
      name: 'test-params',
      fetcher: () => (param: number) => of(`data-${param}`),
      getKey: (_instance, param: number) => `key-${param}`,
    })

    const stateSource1 = store.getState(instance, 1)
    const stateSource2 = store.getState(instance, 2)

    const data1 = await firstValueFrom(
      stateSource1.observable.pipe(filter((data) => data !== undefined)),
    )
    const data2 = await firstValueFrom(
      stateSource2.observable.pipe(filter((data) => data !== undefined)),
    )

    expect(data1).toBe('data-1')
    expect(data2).toBe('data-2')
  })
})
