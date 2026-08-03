import {type SanityClient} from '@sanity/client'
import {
  BehaviorSubject,
  delay,
  firstValueFrom,
  type Observable,
  of,
  Subject,
  throwError,
} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getTokenState} from '../auth/authStore'
import {getClient} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type SanityUser} from '../users/types'
import {getUserState} from '../users/usersStore'
import {createBifurTransport} from './bifurTransport'
import {getPresence} from './presenceStore'
import {type PresenceLocation, type TransportEvent, type TransportMessage} from './types'

vi.mock('../auth/authStore')
vi.mock('../client/clientStore')
vi.mock('../users/usersStore')
vi.mock('./bifurTransport')

describe('presenceStore', () => {
  let instance: SanityInstance
  let mockClient: SanityClient
  let mockTokenState: Subject<string | null>
  let mockIncomingEvents: Subject<TransportEvent>
  let mockDispatchMessage: Mock<(message: TransportMessage) => Observable<void>>
  let mockConnections: BehaviorSubject<number>
  let mockUnload: Subject<void>
  let mockGetUserState: Mock<typeof getUserState>

  const mockUser: SanityUser = {
    sanityUserId: 'u123',
    profile: {
      id: 'user-1',
      displayName: 'Test User',
      email: 'test@example.com',
      provider: 'google',
      createdAt: '2023-01-01T00:00:00Z',
    },
    memberships: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock crypto.randomUUID
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: vi.fn(() => 'test-session-id'),
      },
    })

    mockClient = {
      withConfig: vi.fn().mockReturnThis(),
      observable: {
        request: vi.fn(() => of({organizationId: 'test-org-id'})),
      },
    } as unknown as SanityClient

    mockTokenState = new Subject<string | null>()
    mockIncomingEvents = new Subject<TransportEvent>()
    mockDispatchMessage = vi.fn(() => of(undefined))

    vi.mocked(getClient).mockReturnValue(mockClient)
    vi.mocked(getTokenState).mockReturnValue({
      observable: mockTokenState.asObservable(),
      getCurrent: vi.fn(),
      subscribe: vi.fn(),
    })

    // A live connection on subscribe, mirroring `bifur.heartbeats`, which emits
    // as soon as the socket is open and authorized.
    mockConnections = new BehaviorSubject<number>(1)
    mockUnload = new Subject<void>()

    vi.mocked(createBifurTransport).mockReturnValue([
      mockIncomingEvents.asObservable(),
      mockDispatchMessage,
      mockConnections.asObservable(),
      mockUnload.asObservable(),
    ])

    mockGetUserState = vi.fn(() => of(mockUser))
    vi.mocked(getUserState).mockImplementation(mockGetUserState)

    instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})
  })

  afterEach(() => {
    instance.dispose()
  })

  describe('getPresence', () => {
    it('creates bifur transport with correct parameters', () => {
      getPresence(instance)

      expect(createBifurTransport).toHaveBeenCalledWith({
        client: mockClient,
        token$: expect.any(Object),
        sessionId: 'test-session-id',
      })
    })

    it('sends rollCall message on initialization', () => {
      getPresence(instance)

      expect(mockDispatchMessage).toHaveBeenCalledWith({type: 'rollCall'})
    })

    it('returns empty array when no users present', () => {
      const source = getPresence(instance)
      expect(source.getCurrent()).toEqual([])
    })

    it('handles state events from other users', async () => {
      const source = getPresence(instance)

      // Subscribe to initialize the store
      const unsubscribe = source.subscribe(() => {})

      // Wait a bit for initialization
      await firstValueFrom(of(null).pipe(delay(10)))

      const locations: PresenceLocation[] = [
        {
          type: 'document',
          documentId: 'doc-1',
          path: ['title'],
          lastActiveAt: '2023-01-01T12:00:00Z',
        },
      ]

      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-1',
        sessionId: 'other-session',
        timestamp: '2023-01-01T12:00:00Z',
        locations,
      })

      // Wait for processing
      await firstValueFrom(of(null).pipe(delay(20)))

      const presence = source.getCurrent()
      expect(presence).toHaveLength(1)
      expect(presence[0].sessionId).toBe('other-session')
      expect(presence[0].locations).toEqual(locations)

      unsubscribe()
    })

    it('ignores events from own session', async () => {
      const source = getPresence(instance)
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))

      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-1',
        sessionId: 'test-session-id', // Same as our session
        timestamp: '2023-01-01T12:00:00Z',
        locations: [],
      })

      await firstValueFrom(of(null).pipe(delay(20)))

      const presence = source.getCurrent()
      expect(presence).toHaveLength(0)

      unsubscribe()
    })

    it('handles disconnect events', async () => {
      const source = getPresence(instance)
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))

      // First add a user
      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-1',
        sessionId: 'other-session',
        timestamp: '2023-01-01T12:00:00Z',
        locations: [],
      })

      await firstValueFrom(of(null).pipe(delay(20)))
      expect(source.getCurrent()).toHaveLength(1)

      // Then disconnect them
      mockIncomingEvents.next({
        type: 'disconnect',
        userId: 'user-1',
        sessionId: 'other-session',
        timestamp: '2023-01-01T12:01:00Z',
      })

      await firstValueFrom(of(null).pipe(delay(20)))
      expect(source.getCurrent()).toHaveLength(0)

      unsubscribe()
    })

    it('fetches user data for present users', async () => {
      const source = getPresence(instance)
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))

      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-1',
        sessionId: 'other-session',
        timestamp: '2023-01-01T12:00:00Z',
        locations: [
          {
            type: 'document',
            documentId: 'doc-1',
            path: ['title'],
            lastActiveAt: '2023-01-01T12:00:00Z',
          },
        ],
      })

      await firstValueFrom(of(null).pipe(delay(50)))

      expect(getUserState).toHaveBeenCalledWith(instance, {
        userId: 'user-1',
        resourceType: 'project',
        projectId: 'test-project',
      })

      unsubscribe()
    })

    it('handles presence events correctly', async () => {
      const source = getPresence(instance)
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))

      mockIncomingEvents.next({
        type: 'state',
        userId: 'test-user',
        sessionId: 'other-session',
        timestamp: '2023-01-01T12:00:00Z',
        locations: [],
      })

      await firstValueFrom(of(null).pipe(delay(50)))

      const presence = source.getCurrent()
      expect(presence).toHaveLength(1)
      expect(presence[0].sessionId).toBe('other-session')

      unsubscribe()
    })

    it('should throw an error when initialized with a media library resource', () => {
      const mediaLibraryResource = {mediaLibraryId: 'ml123'}

      expect(() => {
        getPresence(instance, {resource: mediaLibraryResource})
      }).toThrow('Presence is not supported for media library resources.')
    })

    it('should work with a dataset resource', () => {
      const datasetResource = {projectId: 'test-project', dataset: 'test-dataset'}

      expect(() => {
        getPresence(instance, {resource: datasetResource})
      }).not.toThrow()
    })

    it('should work with a canvas resource', () => {
      const canvasResource = {canvasId: 'canvas123'}

      expect(() => {
        getPresence(instance, {resource: canvasResource})
      }).not.toThrow()
    })

    it('creates a project-hostname client for dataset resources', () => {
      getPresence(instance, {resource: {projectId: 'my-project', dataset: 'my-dataset'}})

      expect(getClient).toHaveBeenCalledWith(instance, {
        apiVersion: '2026-03-30',
        projectId: 'my-project',
        dataset: 'my-dataset',
        useProjectHostname: true,
      })
    })

    it('creates a resource client for canvas resources', () => {
      const canvasResource = {canvasId: 'canvas123'}
      getPresence(instance, {resource: canvasResource})

      expect(getClient).toHaveBeenCalledWith(instance, {
        apiVersion: '2026-03-30',
        resource: canvasResource,
      })
    })

    it('fetches organizationId from canvas endpoint for canvas resources', () => {
      const canvasResource = {canvasId: 'canvas123'}
      getPresence(instance, {resource: canvasResource})

      expect(mockClient.observable.request).toHaveBeenCalledWith({
        uri: '/canvases/canvas123',
        tag: 'canvases.get',
      })
    })

    it('does not fetch organizationId for dataset resources', () => {
      getPresence(instance, {resource: {projectId: 'my-project', dataset: 'my-dataset'}})

      expect(mockClient.observable.request).not.toHaveBeenCalled()
    })

    it('fetches user data for canvas users', async () => {
      const source = getPresence(instance, {resource: {canvasId: 'canvas123'}})
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))

      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-1',
        sessionId: 'other-session',
        timestamp: '2023-01-01T12:00:00Z',
        locations: [
          {
            type: 'document',
            documentId: 'doc-1',
            path: ['title'],
            lastActiveAt: '2023-01-01T12:00:00Z',
          },
        ],
      })

      await firstValueFrom(of(null).pipe(delay(50)))

      expect(getUserState).toHaveBeenCalledWith(instance, {
        userId: 'user-1',
        resourceType: 'organization',
        organizationId: 'test-org-id',
      })

      unsubscribe()
    })

    it('resolves no users when the canvas organization lookup fails', async () => {
      // Regression guard: this used to be swallowed with `catchError(() => EMPTY)`
      // and consumed with `first()`, so a failed request meant the user stream
      // never emitted and every participant stayed "Unknown user" forever.
      mockClient = {
        withConfig: vi.fn().mockReturnThis(),
        observable: {
          request: vi.fn(() => throwError(() => new Error('canvas lookup failed'))),
        },
      } as unknown as SanityClient
      vi.mocked(getClient).mockReturnValue(mockClient)

      const source = getPresence(instance, {resource: {canvasId: 'canvas123'}})
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))

      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-1',
        sessionId: 'other-session',
        timestamp: '2023-01-01T12:00:00Z',
        locations: [],
      })

      await firstValueFrom(of(null).pipe(delay(50)))

      // The presence itself still surfaces, with a placeholder user.
      const presence = source.getCurrent()
      expect(presence).toHaveLength(1)
      expect(presence[0].user.profile.displayName).toBe('Unknown user')
      // No doomed request is made without an organization to scope it to.
      expect(getUserState).not.toHaveBeenCalled()

      unsubscribe()
    })

    it('gives an unresolved user a structurally valid profile', async () => {
      // The placeholder used to be cast through `as unknown as SanityUser` with
      // no `profile`, so reading `user.profile.displayName` threw on first render.
      mockGetUserState = vi.fn(() => of(undefined))
      vi.mocked(getUserState).mockImplementation(mockGetUserState)

      const source = getPresence(instance)
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))

      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-1',
        sessionId: 'other-session',
        timestamp: '2023-01-01T12:00:00Z',
        locations: [],
      })

      await firstValueFrom(of(null).pipe(delay(20)))

      const [presence] = source.getCurrent()
      expect(presence.user.profile.displayName).toBe('Unknown user')
      expect(presence.user.profile.id).toBe('user-1')
      expect(presence.user.sanityUserId).toBe('user-1')
      expect(presence.user.memberships).toEqual([])

      unsubscribe()
    })
  })

  describe('connection lifecycle', () => {
    it('clears accumulated presence and re-rollCalls when the socket reconnects', async () => {
      const source = getPresence(instance)
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))

      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-1',
        sessionId: 'other-session',
        timestamp: '2023-01-01T12:00:00Z',
        locations: [],
      })

      await firstValueFrom(of(null).pipe(delay(20)))
      expect(source.getCurrent()).toHaveLength(1)
      expect(mockDispatchMessage).toHaveBeenCalledTimes(1)

      // A new generation means a freshly live socket. Anything accumulated is
      // suspect, because peers may have come or gone while we were away.
      mockConnections.next(2)

      await firstValueFrom(of(null).pipe(delay(20)))
      expect(source.getCurrent()).toHaveLength(0)
      expect(mockDispatchMessage).toHaveBeenNthCalledWith(2, {type: 'rollCall'})

      // Wiping the map is only safe because peers answer that roll call and
      // repopulate it. If the inbound listener did not survive the reconnect,
      // this would stay empty for the life of the page.
      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-2',
        sessionId: 'a-peer-answering',
        timestamp: '2023-01-01T12:00:05Z',
        locations: [],
      })

      await firstValueFrom(of(null).pipe(delay(20)))
      expect(source.getCurrent()).toHaveLength(1)
      expect(source.getCurrent()[0].sessionId).toBe('a-peer-answering')

      unsubscribe()
    })

    it('announces a disconnect when the page unloads', async () => {
      const source = getPresence(instance)
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))
      mockDispatchMessage.mockClear()

      mockUnload.next()

      expect(mockDispatchMessage).toHaveBeenCalledWith({type: 'disconnect'})

      unsubscribe()
    })
  })

  describe('stale session expiry', () => {
    it('drops a session that stops announcing', async () => {
      vi.useFakeTimers()
      try {
        const source = getPresence(instance)
        const unsubscribe = source.subscribe(() => {})

        await vi.advanceTimersByTimeAsync(10)

        mockIncomingEvents.next({
          type: 'state',
          userId: 'user-1',
          sessionId: 'other-session',
          timestamp: new Date().toISOString(),
          locations: [],
        })

        await vi.advanceTimersByTimeAsync(20)
        expect(source.getCurrent()).toHaveLength(1)

        // Peers re-announce every 30s, so surviving a sweep at 60s proves the
        // sweep is not just deleting everything it sees.
        await vi.advanceTimersByTimeAsync(60_000)
        expect(source.getCurrent()).toHaveLength(1)

        // Past the 90s TTL with no further announcements, the peer is gone.
        await vi.advanceTimersByTimeAsync(45_000)
        expect(source.getCurrent()).toHaveLength(0)

        unsubscribe()
      } finally {
        vi.useRealTimers()
      }
    })

    it('keeps a session alive while it keeps announcing', async () => {
      vi.useFakeTimers()
      try {
        const source = getPresence(instance)
        const unsubscribe = source.subscribe(() => {})

        await vi.advanceTimersByTimeAsync(10)

        // Six announcements 30s apart, spanning well past the TTL.
        for (let i = 0; i < 6; i++) {
          mockIncomingEvents.next({
            type: 'state',
            userId: 'user-1',
            sessionId: 'other-session',
            timestamp: new Date().toISOString(),
            locations: [],
          })
          await vi.advanceTimersByTimeAsync(30_000)
        }

        expect(source.getCurrent()).toHaveLength(1)

        unsubscribe()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('session id', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('gives each store its own id, so nothing can collide across tabs', () => {
      // Ids are deliberately not persisted: a tab that inherits another's
      // session storage would otherwise reuse the id and the two live clients
      // would filter each other out as their own session.
      let counter = 0
      vi.stubGlobal('crypto', {randomUUID: vi.fn(() => `session-${++counter}`)})

      getPresence(instance, {resource: {projectId: 'p1', dataset: 'd1'}}).subscribe(() => {})
      const first = vi.mocked(createBifurTransport).mock.calls.at(-1)?.[0].sessionId

      getPresence(instance, {resource: {projectId: 'p2', dataset: 'd2'}}).subscribe(() => {})
      const second = vi.mocked(createBifurTransport).mock.calls.at(-1)?.[0].sessionId

      expect(first).toBe('session-1')
      expect(second).toBe('session-2')
    })
  })
})
