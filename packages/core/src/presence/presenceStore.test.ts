import {type SanityClient} from '@sanity/client'
import {delay, firstValueFrom, type Observable, of, Subject} from 'rxjs'
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

    vi.mocked(createBifurTransport).mockReturnValue([
      mockIncomingEvents.asObservable(),
      mockDispatchMessage,
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
  })
})
