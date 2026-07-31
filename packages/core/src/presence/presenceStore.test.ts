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
import {getDocumentPresence, getPresence, reportPresence} from './presenceStore'
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

  describe('getDocumentPresence', () => {
    /** Puts a peer in a document at the given paths. */
    const peerAt = async (
      sessionId: string,
      locations: {documentId: string; path?: unknown[]; selection?: unknown}[],
    ) => {
      mockIncomingEvents.next({
        type: 'state',
        userId: 'user-1',
        sessionId,
        timestamp: '2026-07-30T12:00:00Z',
        locations: locations.map((l) => ({
          type: 'document',
          documentId: l.documentId,
          path: (l.path ?? []) as string[],
          lastActiveAt: '2026-07-30T12:00:00Z',
          ...(l.selection === undefined ? {} : {selection: l.selection}),
        })) as never,
      })
      await firstValueFrom(of(null).pipe(delay(20)))
    }

    it('flattens one entry per participant per location', async () => {
      const source = getDocumentPresence(instance, {documentId: 'movie-1'})
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [
        {documentId: 'movie-1', path: ['title']},
        {documentId: 'movie-1', path: ['body']},
      ])

      const presence = source.getCurrent()
      expect(presence).toHaveLength(2)
      expect(presence.map((p) => p.path)).toEqual([['title'], ['body']])
      expect(presence.every((p) => p.sessionId === 'peer-a')).toBe(true)

      unsubscribe()
    })

    it('treats a draft, its published version, and a release version as one document', async () => {
      const source = getDocumentPresence(instance, {documentId: 'movie-1'})
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [{documentId: 'drafts.movie-1'}])
      await peerAt('peer-b', [{documentId: 'versions.r1.movie-1'}])
      await peerAt('peer-c', [{documentId: 'movie-1'}])

      // What a document list wants: someone is in this document, wherever exactly.
      expect(source.getCurrent()).toHaveLength(3)

      unsubscribe()
    })

    it('compares ids exactly when excludeVersions is set', async () => {
      const source = getDocumentPresence(instance, {
        documentId: 'drafts.movie-1',
        excludeVersions: true,
      })
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [{documentId: 'drafts.movie-1'}])
      await peerAt('peer-b', [{documentId: 'versions.r1.movie-1'}])

      // What a field indicator wants: a release version must not bleed into the
      // draft the user is actually looking at.
      const presence = source.getCurrent()
      expect(presence).toHaveLength(1)
      expect(presence[0].documentId).toBe('drafts.movie-1')

      unsubscribe()
    })

    it('matches a peer in the draft when queried with a published id and excludeVersions', async () => {
      // The field-indicator case, and the one that only works if the read side
      // resolves the perspective exactly as the write side does. `excludeVersions`
      // turns off published-id normalization, so an unresolved query for `movie-1`
      // would never match a peer reporting `drafts.movie-1`.
      const source = getDocumentPresence(instance, {
        documentId: 'movie-1',
        excludeVersions: true,
      })
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [{documentId: 'drafts.movie-1', path: ['title']}])

      const presence = source.getCurrent()
      expect(presence).toHaveLength(1)
      expect(presence[0].documentId).toBe('drafts.movie-1')

      unsubscribe()
    })

    it('narrows to a field subtree, including the field itself', async () => {
      const source = getDocumentPresence(instance, {documentId: 'movie-1', path: ['body']})
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [
        {documentId: 'movie-1', path: ['title']},
        {documentId: 'movie-1', path: ['body']},
        {documentId: 'movie-1', path: ['body', {_key: 'b1'}, 'children']},
      ])

      const presence = source.getCurrent()
      expect(presence).toHaveLength(2)
      expect(presence.map((p) => p.path)).toEqual([['body'], ['body', {_key: 'b1'}, 'children']])

      unsubscribe()
    })

    it('matches keyed path segments by key, not by identity', async () => {
      const source = getDocumentPresence(instance, {
        documentId: 'movie-1',
        // A different object with the same key, which is what arrives over the wire.
        path: ['cast', {_key: 'member-2'}],
      })
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [
        {documentId: 'movie-1', path: ['cast', {_key: 'member-1'}, 'name']},
        {documentId: 'movie-1', path: ['cast', {_key: 'member-2'}, 'name']},
      ])

      const presence = source.getCurrent()
      expect(presence).toHaveLength(1)
      expect(presence[0].path).toEqual(['cast', {_key: 'member-2'}, 'name'])

      unsubscribe()
    })

    it('preserves a Portable Text selection', async () => {
      const selection = {
        anchor: {path: [{_key: 'b1'}, 'children', {_key: 's1'}], offset: 2},
        focus: {path: [{_key: 'b1'}, 'children', {_key: 's1'}], offset: 9},
        backward: false,
      }

      const source = getDocumentPresence(instance, {documentId: 'movie-1'})
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [{documentId: 'movie-1', path: ['body'], selection}])

      expect(source.getCurrent()[0].selection).toEqual(selection)

      unsubscribe()
    })

    it('omits selection when the participant did not report one', async () => {
      const source = getDocumentPresence(instance, {documentId: 'movie-1'})
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [{documentId: 'movie-1', path: ['title']}])

      expect('selection' in source.getCurrent()[0]).toBe(false)

      unsubscribe()
    })

    it('returns a referentially stable snapshot', async () => {
      const source = getDocumentPresence(instance, {documentId: 'movie-1'})
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))
      await peerAt('peer-a', [{documentId: 'movie-1', path: ['title']}])

      // React calls `getCurrent` as its `useSyncExternalStore` snapshot on every
      // render. Returning a fresh array each call sends it into an infinite
      // render loop, so this is load-bearing rather than a micro-optimisation.
      expect(source.getCurrent()).toBe(source.getCurrent())

      unsubscribe()
    })

    it('keeps separate snapshots per query, so callers do not evict each other', async () => {
      const movie = getDocumentPresence(instance, {documentId: 'movie-1'})
      const other = getDocumentPresence(instance, {documentId: 'movie-2'})
      const titleOnly = getDocumentPresence(instance, {documentId: 'movie-1', path: ['title']})
      const subs = [movie, other, titleOnly].map((s) => s.subscribe(() => {}))
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [
        {documentId: 'movie-1', path: ['title']},
        {documentId: 'movie-1', path: ['body']},
      ])

      // Interleaved reads, which is what concurrent components do.
      const movieFirst = movie.getCurrent()
      const titleFirst = titleOnly.getCurrent()
      expect(movie.getCurrent()).toBe(movieFirst)
      expect(titleOnly.getCurrent()).toBe(titleFirst)

      expect(movieFirst).toHaveLength(2)
      expect(titleFirst).toHaveLength(1)
      expect(other.getCurrent()).toEqual([])

      subs.forEach((unsubscribe) => unsubscribe())
    })

    it('resolves display names without anything else subscribing first', async () => {
      // Regression guard: user resolution used to hang off `getPresence`'s
      // `onSubscribe`, so reading presence any other way showed only
      // "Unknown user". It belongs to the store, not to one state source.
      const source = getDocumentPresence(instance, {documentId: 'movie-1'})
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [{documentId: 'movie-1', path: ['title']}])
      await firstValueFrom(of(null).pipe(delay(50)))

      expect(getUserState).toHaveBeenCalledWith(instance, {
        userId: 'user-1',
        resourceType: 'project',
        projectId: 'test-project',
      })
      expect(source.getCurrent()[0].user.profile.displayName).toBe('Test User')

      unsubscribe()
    })

    it('ignores other documents entirely', async () => {
      const source = getDocumentPresence(instance, {documentId: 'movie-1'})
      const unsubscribe = source.subscribe(() => {})
      await firstValueFrom(of(null).pipe(delay(10)))

      await peerAt('peer-a', [{documentId: 'movie-2', path: ['title']}])

      expect(source.getCurrent()).toEqual([])

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

    it('still announces a disconnect if an earlier one failed', async () => {
      const source = getPresence(instance)
      const unsubscribe = source.subscribe(() => {})

      await firstValueFrom(of(null).pipe(delay(10)))
      mockDispatchMessage.mockClear()

      // `pagehide` can fire more than once: a page restored from the back/forward
      // cache will fire it again. A failure on the first must not kill the stream.
      mockDispatchMessage.mockReturnValueOnce(throwError(() => new Error('socket closed')))
      mockUnload.next()
      mockUnload.next()

      expect(mockDispatchMessage.mock.calls.filter(([m]) => m.type === 'disconnect')).toHaveLength(
        2,
      )

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

  describe('reportPresence', () => {
    /** Drains the audit window so a pending announcement is flushed. */
    const flush = () => vi.advanceTimersByTimeAsync(250)

    const stateCalls = () =>
      mockDispatchMessage.mock.calls
        .map(([message]) => message)
        .filter(
          (message): message is Extract<TransportMessage, {type: 'state'}> =>
            message.type === 'state',
        )

    it('stays silent until the app reports, so reading never broadcasts', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        await flush()
        await vi.advanceTimersByTimeAsync(60_000)

        // A rollCall goes out on connect, but never a state announcement.
        expect(mockDispatchMessage).toHaveBeenCalledWith({type: 'rollCall'})
        expect(stateCalls()).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })

    it('resolves the reported id from the perspective', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)

        // Default: the draft, which is what the Studio's form is on and therefore
        // what its field indicators compare against.
        reportPresence(instance, {locations: [{documentId: 'movie-1'}]})
        await flush()
        expect(stateCalls().at(-1)!.locations[0].documentId).toBe('drafts.movie-1')

        reportPresence(instance, {locations: [{documentId: 'movie-1', perspective: 'published'}]})
        await flush()
        expect(stateCalls().at(-1)!.locations[0].documentId).toBe('movie-1')

        reportPresence(instance, {
          locations: [{documentId: 'movie-1', perspective: {releaseName: 'autumn'}}],
        })
        await flush()
        expect(stateCalls().at(-1)!.locations[0].documentId).toBe('versions.autumn.movie-1')

        reportPresence(instance, {locations: [{documentId: 'movie-1', liveEdit: true}]})
        await flush()
        expect(stateCalls().at(-1)!.locations[0].documentId).toBe('movie-1')
      } finally {
        vi.useRealTimers()
      }
    })

    it('announces a document-level location', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'))
      try {
        getPresence(instance)
        reportPresence(instance, {locations: [{documentId: 'doc-1'}]})
        await flush()

        expect(stateCalls()).toEqual([
          {
            type: 'state',
            locations: [
              {
                type: 'document',
                // Resolved to the draft, which is the default perspective.
                documentId: 'drafts.doc-1',
                path: [],
                lastActiveAt: '2026-07-30T12:00:00.000Z',
              },
            ],
          },
        ])
      } finally {
        vi.useRealTimers()
      }
    })

    it('carries keyed path segments and a Portable Text selection', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        // The shape the Studio expects: keyed segments for array items and spans.
        reportPresence(instance, {
          locations: [
            {
              documentId: 'doc-1',
              path: ['body', {_key: 'block-1'}, 'children', {_key: 'span-1'}, 'text'],
              selection: {
                anchor: {path: [{_key: 'block-1'}, 'children', {_key: 'span-1'}], offset: 3},
                focus: {path: [{_key: 'block-1'}, 'children', {_key: 'span-1'}], offset: 7},
                backward: false,
              },
            },
          ],
        })
        await flush()

        const [announced] = stateCalls()
        expect(announced.locations[0].path).toEqual([
          'body',
          {_key: 'block-1'},
          'children',
          {_key: 'span-1'},
          'text',
        ])
        expect(announced.locations[0].selection).toEqual({
          anchor: {path: [{_key: 'block-1'}, 'children', {_key: 'span-1'}], offset: 3},
          focus: {path: [{_key: 'block-1'}, 'children', {_key: 'span-1'}], offset: 7},
          backward: false,
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('omits selection entirely when none was reported', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        reportPresence(instance, {locations: [{documentId: 'doc-1', path: ['title']}]})
        await flush()

        expect('selection' in stateCalls()[0].locations[0]).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('announces an empty location list as present but nowhere', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        reportPresence(instance, {locations: []})
        await flush()

        expect(stateCalls()).toEqual([{type: 'state', locations: []}])
      } finally {
        vi.useRealTimers()
      }
    })

    it('collapses reports spread across the audit window into one announcement', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)

        // Deliberately spaced out. Reports made in the same tick are collapsed by
        // `switchMap` alone, so stepping the clock between them is what actually
        // exercises the audit window - which is the case that matters, since a
        // user typing produces focus changes tens of milliseconds apart.
        reportPresence(instance, {locations: [{documentId: 'doc-1', path: ['a']}]})
        await vi.advanceTimersByTimeAsync(50)
        reportPresence(instance, {locations: [{documentId: 'doc-1', path: ['b']}]})
        await vi.advanceTimersByTimeAsync(50)
        reportPresence(instance, {locations: [{documentId: 'doc-1', path: ['c']}]})
        await flush()

        const announced = stateCalls()
        expect(announced).toHaveLength(1)
        expect(announced[0].locations[0].path).toEqual(['c'])
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not re-announce when only lastActiveAt would differ', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        reportPresence(instance, {locations: [{documentId: 'doc-1', path: ['title']}]})
        await flush()
        expect(stateCalls()).toHaveLength(1)

        // Same place, reported again. `lastActiveAt` is regenerated, but nothing
        // moved, so this must not restart the heartbeat.
        await vi.advanceTimersByTimeAsync(5_000)
        reportPresence(instance, {locations: [{documentId: 'doc-1', path: ['title']}]})
        await flush()

        expect(stateCalls()).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('re-announces every 30s while idle, so peers do not expire it', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        reportPresence(instance, {locations: [{documentId: 'doc-1'}]})
        await flush()
        expect(stateCalls()).toHaveLength(1)

        await vi.advanceTimersByTimeAsync(30_000)
        expect(stateCalls()).toHaveLength(2)

        await vi.advanceTimersByTimeAsync(30_000)
        expect(stateCalls()).toHaveLength(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it("answers another client's roll call", async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        reportPresence(instance, {locations: [{documentId: 'doc-1'}]})
        await flush()
        expect(stateCalls()).toHaveLength(1)

        mockIncomingEvents.next({
          type: 'rollCall',
          userId: 'user-2',
          sessionId: 'their-session',
        })
        await flush()

        expect(stateCalls()).toHaveLength(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('ignores the echo of its own roll call', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        reportPresence(instance, {locations: [{documentId: 'doc-1'}]})
        await flush()
        expect(stateCalls()).toHaveLength(1)

        // Bifur publishes to the topic we are subscribed to, so our own roll call
        // comes straight back. Answering it would be a pointless round trip.
        mockIncomingEvents.next({
          type: 'rollCall',
          userId: 'user-1',
          sessionId: 'test-session-id',
        })
        await flush()

        expect(stateCalls()).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('keeps announcing after a failed announcement', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        reportPresence(instance, {locations: [{documentId: 'doc-1'}]})
        await flush()
        expect(stateCalls()).toHaveLength(1)

        // A dropped socket errors the in-flight request. If that error reaches the
        // announce stream it kills every trigger at once, because the heartbeat,
        // roll-call responses, and reconnect re-announce all share this chain.
        mockDispatchMessage.mockReturnValueOnce(throwError(() => new Error('socket closed')))
        await vi.advanceTimersByTimeAsync(30_000)
        expect(stateCalls()).toHaveLength(2)

        // The heartbeat must survive the failure.
        await vi.advanceTimersByTimeAsync(30_000)
        expect(stateCalls()).toHaveLength(3)

        // So must roll-call responses.
        mockIncomingEvents.next({type: 'rollCall', userId: 'user-2', sessionId: 'their-session'})
        await flush()
        expect(stateCalls()).toHaveLength(4)

        // And so must the re-announce on reconnect, which is the path that matters
        // most: the failure and the reconnect have the same root cause.
        mockConnections.next(2)
        await flush()
        expect(stateCalls()).toHaveLength(5)
      } finally {
        vi.useRealTimers()
      }
    })

    it('keeps announcing when a trigger source fails', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        reportPresence(instance, {locations: [{documentId: 'doc-1'}]})
        await flush()
        expect(stateCalls()).toHaveLength(1)

        // The three announce triggers are combined with `merge`, which propagates
        // an error from any one of them. The inbound stream feeds the roll-call
        // trigger, so a failure there would otherwise take the heartbeat and the
        // reconnect re-announce down with it.
        mockIncomingEvents.error(new Error('inbound stream failed'))

        await vi.advanceTimersByTimeAsync(30_000)
        expect(stateCalls()).toHaveLength(2)

        mockConnections.next(2)
        await flush()
        expect(stateCalls()).toHaveLength(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it('re-announces after a reconnect', async () => {
      vi.useFakeTimers()
      try {
        getPresence(instance)
        reportPresence(instance, {locations: [{documentId: 'doc-1'}]})
        await flush()
        expect(stateCalls()).toHaveLength(1)

        mockConnections.next(2)
        await flush()

        // Peers cleared their view of us when we dropped, so we have to speak up.
        expect(stateCalls()).toHaveLength(2)
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
