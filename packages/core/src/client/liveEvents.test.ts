import {
  ConnectionFailedError,
  CorsOriginError,
  DisconnectError,
  type LiveEvent,
  type LiveEventMessage,
  type SanityClient,
} from '@sanity/client'
import {of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getClientState} from './clientStore'
import {LIVE_EVENTS_RETRY_DELAY, observeLiveEvents} from './liveEvents'

vi.mock('./clientStore', () => ({getClientState: vi.fn()}))

describe('observeLiveEvents', () => {
  let instance: SanityInstance
  let liveEventSubjects: Subject<LiveEvent>[]
  let events: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    liveEventSubjects = []
    events = vi.fn().mockImplementation(() => {
      const subject = new Subject<LiveEvent>()
      liveEventSubjects.push(subject)
      return subject
    })

    vi.mocked(getClientState).mockReturnValue({
      observable: of({
        config: vi.fn().mockReturnValue({token: 'token'}),
        live: {events},
      } as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => {
    instance.dispose()
  })

  it('emits only message events', () => {
    const messages: LiveEventMessage[] = []
    const subscription = observeLiveEvents(instance, {onCorsError: vi.fn()}).subscribe((message) =>
      messages.push(message),
    )

    liveEventSubjects[0].next({type: 'welcome'} as LiveEvent)
    liveEventSubjects[0].next({type: 'message', id: 'e1', tags: ['s1:a']} as LiveEvent)

    expect(messages).toEqual([{type: 'message', id: 'e1', tags: ['s1:a']}])
    subscription.unsubscribe()
  })

  it('reports CORS errors through onCorsError and completes without erroring', () => {
    const onCorsError = vi.fn()
    const error = vi.fn()
    const complete = vi.fn()
    observeLiveEvents(instance, {onCorsError}).subscribe({error, complete})

    const corsError = new CorsOriginError({projectId: 'test'})
    liveEventSubjects[0].error(corsError)

    expect(onCorsError).toHaveBeenCalledWith(corsError)
    expect(error).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalled()
  })

  it('completes without retrying on DisconnectError', async () => {
    vi.useFakeTimers()
    try {
      const error = vi.fn()
      const complete = vi.fn()
      observeLiveEvents(instance, {onCorsError: vi.fn()}).subscribe({error, complete})

      liveEventSubjects[0].error(new DisconnectError('Server disconnected client'))
      await vi.advanceTimersByTimeAsync(LIVE_EVENTS_RETRY_DELAY * 5)

      expect(error).not.toHaveBeenCalled()
      expect(complete).toHaveBeenCalled()
      expect(events).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('completes without retrying on a 4xx connection rejection', async () => {
    vi.useFakeTimers()
    try {
      const error = vi.fn()
      const complete = vi.fn()
      observeLiveEvents(instance, {onCorsError: vi.fn()}).subscribe({error, complete})

      // The server rejected the connection with a 401 (e.g. expired token) —
      // it will keep rejecting, so retrying would reconnect once per second
      // forever
      liveEventSubjects[0].error(
        new ConnectionFailedError('EventSource connection failed', {status: 401}),
      )
      await vi.advanceTimersByTimeAsync(LIVE_EVENTS_RETRY_DELAY * 5)

      expect(error).not.toHaveBeenCalled()
      expect(complete).toHaveBeenCalled()
      expect(events).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries a connection failure without a status (transient network failure)', async () => {
    vi.useFakeTimers()
    try {
      const error = vi.fn()
      const subscription = observeLiveEvents(instance, {onCorsError: vi.fn()}).subscribe({error})

      // No status means the failure could be transient (native EventSource
      // exposes no status) — reconnecting is correct here
      liveEventSubjects[0].error(new ConnectionFailedError('EventSource connection failed'))
      await vi.advanceTimersByTimeAsync(LIVE_EVENTS_RETRY_DELAY)

      expect(events).toHaveBeenCalledTimes(2)
      expect(error).not.toHaveBeenCalled()
      subscription.unsubscribe()
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries the connection after server-initiated errors', async () => {
    vi.useFakeTimers()
    try {
      const error = vi.fn()
      const subscription = observeLiveEvents(instance, {onCorsError: vi.fn()}).subscribe({error})
      expect(events).toHaveBeenCalledTimes(1)

      liveEventSubjects[0].error(new Error('ChannelError'))
      await vi.advanceTimersByTimeAsync(LIVE_EVENTS_RETRY_DELAY)

      expect(events).toHaveBeenCalledTimes(2)
      expect(error).not.toHaveBeenCalled()
      subscription.unsubscribe()
    } finally {
      vi.useRealTimers()
    }
  })
})
