import {
  ChannelError,
  ConnectionFailedError,
  CorsOriginError,
  DisconnectError,
  type ListenEvent,
  MessageError,
  MessageParseError,
  type SanityClient,
} from '@sanity/client'
import {concat, of, Subject, Subscription, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  observeQueryChanges,
  QUERY_CHANGE_INTERVAL,
  QUERY_INDEXING_DELAY,
} from './observeQueryChanges'

describe('observeQueryChanges', () => {
  let subscription: Subscription
  let listen: ReturnType<typeof vi.fn>
  let events: Subject<ListenEvent>
  let client: SanityClient

  beforeEach(() => {
    vi.useFakeTimers()
    subscription = new Subscription()
    events = new Subject<ListenEvent>()
    listen = vi.fn().mockReturnValue(events)
    client = {observable: {listen}} as unknown as SanityClient
  })

  afterEach(() => {
    subscription.unsubscribe()
    vi.useRealTimers()
  })

  it.each([new MessageError('server error', {}), new MessageParseError('invalid JSON')])(
    'reopens after $name and invalidates on the new welcome',
    async (error) => {
      listen.mockReturnValueOnce(throwError(() => error))
      const next = vi.fn()
      const onError = vi.fn()
      subscription.add(observeQueryChanges(client, {tag: 'test'}).subscribe({next, error: onError}))
      await vi.advanceTimersByTimeAsync(999)
      expect(listen).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(listen).toHaveBeenCalledTimes(2)
      events.next({type: 'welcome'} as ListenEvent)
      await vi.advanceTimersByTimeAsync(QUERY_CHANGE_INTERVAL)
      expect(next).toHaveBeenCalledTimes(1)
      expect(onError).not.toHaveBeenCalled()
    },
  )

  it('backs off repeated server errors and cancels the retry on unsubscribe', async () => {
    listen.mockReturnValue(throwError(() => new MessageError('server error', {})))
    subscription.add(observeQueryChanges(client, {tag: 'test'}).subscribe())
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const previousCalls = listen.mock.calls.length
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(listen).toHaveBeenCalledTimes(previousCalls)
      await vi.advanceTimersByTimeAsync(1)
      expect(listen).toHaveBeenCalledTimes(previousCalls + 1)
    }
    subscription.unsubscribe()
    const previousCalls = listen.mock.calls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(listen).toHaveBeenCalledTimes(previousCalls)
  })

  it('backs off welcome-then-error loops instead of resetting on each welcome', async () => {
    listen.mockReturnValue(
      concat(
        of({type: 'welcome'} as ListenEvent),
        throwError(() => new MessageError('server error', {})),
      ),
    )
    subscription.add(observeQueryChanges(client, {tag: 'test'}).subscribe())
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const previousCalls = listen.mock.calls.length
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(listen).toHaveBeenCalledTimes(previousCalls)
      await vi.advanceTimersByTimeAsync(1)
      expect(listen).toHaveBeenCalledTimes(previousCalls + 1)
    }
  })

  it('resets backoff after a stable connection, including an idle dataset', async () => {
    listen.mockReturnValueOnce(throwError(() => new MessageError('server error', {})))
    subscription.add(observeQueryChanges(client, {tag: 'test'}).subscribe())
    await vi.advanceTimersByTimeAsync(1000)
    events.next({type: 'welcome'} as ListenEvent)
    await vi.advanceTimersByTimeAsync(30000)
    events.error(new MessageError('server error', {}))
    await vi.advanceTimersByTimeAsync(999)
    expect(listen).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(listen).toHaveBeenCalledTimes(3)
  })

  it('does not count time disconnected as a stable connection', async () => {
    listen.mockReturnValueOnce(throwError(() => new MessageError('server error', {})))
    subscription.add(observeQueryChanges(client, {tag: 'test'}).subscribe())
    await vi.advanceTimersByTimeAsync(1000)
    events.next({type: 'welcome'} as ListenEvent)
    events.next({type: 'reconnect'} as ListenEvent)
    await vi.advanceTimersByTimeAsync(30000)
    events.error(new MessageError('server error', {}))
    await vi.advanceTimersByTimeAsync(1999)
    expect(listen).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(listen).toHaveBeenCalledTimes(3)
  })

  it.each([new CorsOriginError({projectId: 'test'}), new ChannelError('invalid query', {})])(
    'surfaces $name without retrying a rejected listener',
    async (error) => {
      listen.mockReturnValue(throwError(() => error))
      const onError = vi.fn()
      subscription.add(observeQueryChanges(client, {tag: 'test'}).subscribe({error: onError}))
      await vi.advanceTimersByTimeAsync(60000)
      expect(listen).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    },
  )

  it.each([
    new ConnectionFailedError('expired token', {status: 401}),
    new ConnectionFailedError('forbidden', {status: 403}),
    new DisconnectError('dataset removed'),
  ])('ends invalidation after $name without failing readable query data', async (error) => {
    listen.mockReturnValue(throwError(() => error))
    const onError = vi.fn()
    const complete = vi.fn()
    subscription.add(
      observeQueryChanges(client, {tag: 'test'}).subscribe({error: onError, complete}),
    )
    await vi.advanceTimersByTimeAsync(60000)
    expect(listen).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending indexing refresh on unsubscribe', async () => {
    const next = vi.fn()
    subscription.add(observeQueryChanges(client, {tag: 'test'}).subscribe(next))
    events.next({type: 'mutation', visibility: 'transaction'} as ListenEvent)
    subscription.unsubscribe()
    await vi.advanceTimersByTimeAsync(QUERY_INDEXING_DELAY + QUERY_CHANGE_INTERVAL)
    expect(next).not.toHaveBeenCalled()
  })
})
