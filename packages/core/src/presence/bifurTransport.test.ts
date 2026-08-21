import {fromUrl} from '@sanity/bifur-client'
import {type SanityClient} from '@sanity/client'
import {type Observable, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {createBifurTransport} from './bifurTransport'
import {type PresenceLocation, type TransportEvent} from './types'

vi.mock('@sanity/bifur-client', () => ({
  fromUrl: vi.fn(),
}))

const fromUrlMock = fromUrl as Mock

type BifurStateMessage = {
  type: 'state'
  i: string
  m: {
    sessionId: string
    locations: PresenceLocation[]
  }
}

type BifurDisconnectMessage = {
  type: 'disconnect'
  i: string
  m: {session: string}
}

type BifurRollCallEvent = {
  type: 'rollCall'
  i: string
  session: string
}

type IncomingBifurEvent = BifurRollCallEvent | BifurStateMessage | BifurDisconnectMessage

describe('createBifurTransport', () => {
  let mockBifurClient: {
    listen: Mock
    request: Mock
    heartbeats: Observable<Date>
  }
  let mockSanityClient: SanityClient
  let token$: Subject<string | null>
  let heartbeats$: Subject<Date>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    heartbeats$ = new Subject<Date>()
    mockBifurClient = {
      listen: vi.fn(() => new Subject<never>()),
      request: vi.fn(() => of(undefined)),
      heartbeats: heartbeats$.asObservable(),
    }
    fromUrlMock.mockReturnValue(mockBifurClient)

    // Default mock is a dataset client using project hostname
    mockSanityClient = {
      config: () => ({
        dataset: 'test-dataset',
        url: 'https://test-project.api.sanity.io/v2022-06-30',
        requestTagPrefix: 'test-tag',
      }),
      withConfig: vi.fn().mockReturnThis(),
    } as unknown as SanityClient

    token$ = new Subject<string | null>()
  })

  it('constructs the bifur client URL for a dataset resource', () => {
    createBifurTransport({
      client: mockSanityClient,
      token$,
      sessionId: 'session-id-123',
    })

    expect(fromUrlMock).toHaveBeenCalledWith(
      'wss://test-project.api.sanity.io/v2022-06-30/socket/test-dataset?tag=test-tag',
      {token$},
    )
  })

  it('constructs the bifur client URL for a canvas resource', () => {
    const canvasClient = {
      config: () => ({
        resource: {type: 'canvas', id: 'canvas-123'},
        url: 'https://api.sanity.io/v2022-06-30',
        requestTagPrefix: 'test-tag',
      }),
      withConfig: vi.fn().mockReturnThis(),
    } as unknown as SanityClient

    createBifurTransport({
      client: canvasClient,
      token$,
      sessionId: 'session-id-123',
    })

    expect(fromUrlMock).toHaveBeenCalledWith(
      'wss://api.sanity.io/v2022-06-30/socket/canvases/canvas-123?tag=test-tag',
      {token$},
    )
  })

  it('throws when no canvas resource or dataset is configured', () => {
    const invalidClient = {
      config: () => ({
        url: 'https://api.sanity.io/v2022-06-30',
        requestTagPrefix: 'test-tag',
      }),
      withConfig: vi.fn().mockReturnThis(),
    } as unknown as SanityClient

    expect(() =>
      createBifurTransport({
        client: invalidClient,
        token$,
        sessionId: 'session-id-123',
      }),
    ).toThrow('Unable to determine presence URL')
  })

  it('handles incoming rollCall events', () => {
    const incomingBifurEvents$ = new Subject<IncomingBifurEvent>()
    mockBifurClient.listen.mockReturnValue(incomingBifurEvents$)

    const [incomingEvents$] = createBifurTransport({
      client: mockSanityClient,
      token$,
      sessionId: 'session-id-123',
    })

    const receivedEvents: TransportEvent[] = []
    incomingEvents$.subscribe((event) => receivedEvents.push(event))
    // The listener is established per live connection, so bring one up first.
    heartbeats$.next(new Date())

    incomingBifurEvents$.next({
      type: 'rollCall',
      i: 'user-1',
      session: 'session-id-456',
    })

    expect(receivedEvents).toEqual([
      {
        type: 'rollCall',
        userId: 'user-1',
        sessionId: 'session-id-456',
      },
    ])
  })

  it('handles incoming state events', () => {
    const date = new Date('2024-01-01T12:00:00.000Z')
    vi.setSystemTime(date)

    const incomingBifurEvents$ = new Subject<IncomingBifurEvent>()
    mockBifurClient.listen.mockReturnValue(incomingBifurEvents$)

    const [incomingEvents$] = createBifurTransport({
      client: mockSanityClient,
      token$,
      sessionId: 'session-id-123',
    })

    const receivedEvents: TransportEvent[] = []
    incomingEvents$.subscribe((event) => receivedEvents.push(event))
    // The listener is established per live connection, so bring one up first.
    heartbeats$.next(new Date())

    const locations: PresenceLocation[] = [
      {type: 'document', documentId: 'doc1', path: ['a'], lastActiveAt: new Date().toISOString()},
    ]
    incomingBifurEvents$.next({
      type: 'state',
      i: 'user-1',
      m: {
        sessionId: 'session-id-456',
        locations,
      },
    })

    expect(receivedEvents).toEqual([
      {
        type: 'state',
        userId: 'user-1',
        sessionId: 'session-id-456',
        timestamp: date.toISOString(),
        locations,
      },
    ])
  })

  it('handles incoming disconnect events', () => {
    const date = new Date('2024-01-01T12:00:00.000Z')
    vi.setSystemTime(date)

    const incomingBifurEvents$ = new Subject<IncomingBifurEvent>()
    mockBifurClient.listen.mockReturnValue(incomingBifurEvents$)

    const [incomingEvents$] = createBifurTransport({
      client: mockSanityClient,
      token$,
      sessionId: 'session-id-123',
    })

    const receivedEvents: TransportEvent[] = []
    incomingEvents$.subscribe((event) => receivedEvents.push(event))
    // The listener is established per live connection, so bring one up first.
    heartbeats$.next(new Date())

    incomingBifurEvents$.next({
      type: 'disconnect',
      i: 'user-1',
      m: {
        session: 'session-id-456',
      },
    })

    expect(receivedEvents).toEqual([
      {
        type: 'disconnect',
        userId: 'user-1',
        sessionId: 'session-id-456',
        timestamp: date.toISOString(),
      },
    ])
  })

  it('throws an error for unknown incoming events', () => {
    const incomingBifurEvents$ = new Subject<IncomingBifurEvent>()
    mockBifurClient.listen.mockReturnValue(incomingBifurEvents$)

    const [incomingEvents$] = createBifurTransport({
      client: mockSanityClient,
      token$,
      sessionId: 'session-id-123',
    })

    const errors: Error[] = []
    incomingEvents$.subscribe({
      error: (err) => errors.push(err),
    })
    heartbeats$.next(new Date())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incomingBifurEvents$.next({type: 'unknown'} as any)

    expect(errors.length).toBe(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(errors[0].message).toContain('Got unknown presence event')
  })

  describe('connections', () => {
    it('emits an incrementing generation each time the socket becomes live', () => {
      const [, , connections$] = createBifurTransport({
        client: mockSanityClient,
        token$,
        sessionId: 'my-session',
      })

      const generations: number[] = []
      connections$.subscribe((generation) => generations.push(generation))

      // Several heartbeats on one live socket are a single generation.
      heartbeats$.next(new Date())
      heartbeats$.next(new Date())
      expect(generations).toEqual([1])

      // bifur-client errors the stream when the socket closes. The transport is
      // expected to reconnect rather than give up for the life of the page.
      const reconnected$ = new Subject<Date>()
      mockBifurClient.heartbeats = reconnected$.asObservable()
      heartbeats$.error(new Error('WebSocket connection error'))

      // First retry is scheduled 200ms out (2 ** 1 * 100).
      vi.advanceTimersByTime(200)
      reconnected$.next(new Date())

      expect(generations).toEqual([1, 2])
    })

    it('does not resubscribe before the backoff has elapsed', () => {
      const [, , connections$] = createBifurTransport({
        client: mockSanityClient,
        token$,
        sessionId: 'my-session',
      })

      const generations: number[] = []
      connections$.subscribe((generation) => generations.push(generation))
      heartbeats$.next(new Date())

      const reconnected$ = new Subject<Date>()
      mockBifurClient.heartbeats = reconnected$.asObservable()
      heartbeats$.error(new Error('WebSocket connection error'))

      vi.advanceTimersByTime(199)
      reconnected$.next(new Date())
      expect(generations).toEqual([1])
    })
  })

  describe('incoming events across a reconnect', () => {
    it('keeps delivering presence after the socket drops', () => {
      // bifur errors every stream on the same socket close, the inbound listener
      // included. If only the heartbeat stream recovers, this client re-announces
      // itself to peers while permanently ceasing to see any of them.
      const firstListen$ = new Subject<IncomingBifurEvent>()
      const secondListen$ = new Subject<IncomingBifurEvent>()
      mockBifurClient.listen.mockReturnValueOnce(firstListen$).mockReturnValueOnce(secondListen$)

      const [incomingEvents$, , connections$] = createBifurTransport({
        client: mockSanityClient,
        token$,
        sessionId: 'my-session',
      })

      const received: TransportEvent[] = []
      incomingEvents$.subscribe({
        next: (event) => received.push(event),
        error: () => received.push({type: 'rollCall', userId: 'STREAM_DIED', sessionId: ''}),
      })
      connections$.subscribe()

      heartbeats$.next(new Date())
      firstListen$.next({type: 'rollCall', i: 'user-1', session: 'before'})
      expect(received.map((e) => e.sessionId)).toEqual(['before'])

      // Socket closes: both streams error.
      const reconnectedHeartbeats$ = new Subject<Date>()
      mockBifurClient.heartbeats = reconnectedHeartbeats$.asObservable()
      firstListen$.error(new Error('WebSocket connection error'))
      heartbeats$.error(new Error('WebSocket connection error'))

      vi.advanceTimersByTime(200)
      reconnectedHeartbeats$.next(new Date())

      // Peers answer the roll call we send on reconnect. We have to be listening.
      secondListen$.next({type: 'rollCall', i: 'user-1', session: 'after'})

      expect(received.map((e) => e.sessionId)).toEqual(['before', 'after'])
    })
  })

  describe('unload', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('emits on beforeunload and pagehide, and removes its listeners', () => {
      // These tests run in Node, so stand in a bare EventTarget for `window`.
      const fakeWindow = new EventTarget()
      vi.stubGlobal('window', fakeWindow)

      const [, , , unload$] = createBifurTransport({
        client: mockSanityClient,
        token$,
        sessionId: 'my-session',
      })

      let emissions = 0
      const subscription = unload$.subscribe(() => {
        emissions += 1
      })

      fakeWindow.dispatchEvent(new Event('beforeunload'))
      expect(emissions).toBe(1)

      // `pagehide` matters on its own: iOS Safari and pages entering the
      // back/forward cache never fire `beforeunload`.
      fakeWindow.dispatchEvent(new Event('pagehide'))
      expect(emissions).toBe(2)

      // The listeners belong to the subscription, so unsubscribing removes them
      // instead of leaking one per transport for the life of the page.
      subscription.unsubscribe()
      fakeWindow.dispatchEvent(new Event('beforeunload'))
      expect(emissions).toBe(2)
    })

    it('is inert when there is no window', () => {
      const [, , , unload$] = createBifurTransport({
        client: mockSanityClient,
        token$,
        sessionId: 'my-session',
      })

      let completed = false
      unload$.subscribe({complete: () => (completed = true)})
      expect(completed).toBe(true)
    })
  })

  describe('dispatch', () => {
    it('sends a "rollCall" message', () => {
      const [, dispatchMessage] = createBifurTransport({
        client: mockSanityClient,
        token$,
        sessionId: 'my-session',
      })
      dispatchMessage({type: 'rollCall'})
      expect(mockBifurClient.request).toHaveBeenCalledWith('presence_rollcall', {
        session: 'my-session',
      })
    })

    it('sends a "state" message', () => {
      const [, dispatchMessage] = createBifurTransport({
        client: mockSanityClient,
        token$,
        sessionId: 'my-session',
      })
      const locations: PresenceLocation[] = [
        {type: 'document', documentId: 'doc1', path: ['a'], lastActiveAt: new Date().toISOString()},
      ]
      dispatchMessage({type: 'state', locations})
      expect(mockBifurClient.request).toHaveBeenCalledWith('presence_announce', {
        data: {locations, sessionId: 'my-session'},
      })
    })

    it('sends a "disconnect" message', () => {
      const [, dispatchMessage] = createBifurTransport({
        client: mockSanityClient,
        token$,
        sessionId: 'my-session',
      })
      dispatchMessage({type: 'disconnect'})
      expect(mockBifurClient.request).toHaveBeenCalledWith('presence_disconnect', {
        session: 'my-session',
      })
    })

    it('does nothing for unknown message types', () => {
      const [, dispatchMessage] = createBifurTransport({
        client: mockSanityClient,
        token$,
        sessionId: 'my-session',
      })
      // The type assertion is needed to test this case
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatchMessage({type: 'unknown'} as any)
      expect(mockBifurClient.request).not.toHaveBeenCalled()
    })
  })
})
