import {fromUrl} from '@sanity/bifur-client'
import {type SanityClient} from '@sanity/client'
import {of, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

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
  }
  let mockSanityClient: SanityClient
  let token$: Subject<string | null>

  beforeEach(() => {
    vi.useFakeTimers()
    mockBifurClient = {
      listen: vi.fn(() => new Subject<never>()),
      request: vi.fn(() => of(undefined)),
    }
    fromUrlMock.mockReturnValue(mockBifurClient)

    mockSanityClient = {
      config: () => ({
        dataset: 'test-dataset',
        url: 'http://localhost:3333',
        requestTagPrefix: 'test-tag',
      }),
      withConfig: vi.fn().mockReturnThis(),
    } as unknown as SanityClient

    token$ = new Subject<string | null>()
  })

  it('constructs the bifur client with the correct URL', () => {
    createBifurTransport({
      client: mockSanityClient,
      token$,
      sessionId: 'session-id-123',
    })

    expect(fromUrlMock).toHaveBeenCalledWith(
      'ws://localhost:3333/socket/test-dataset?tag=test-tag',
      {
        token$,
      },
    )
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incomingBifurEvents$.next({type: 'unknown'} as any)

    expect(errors.length).toBe(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(errors[0].message).toContain('Got unknown presence event')
  })

  describe('dispatchMessage', () => {
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
