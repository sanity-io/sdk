import {createSelector} from 'reselect'
import {
  combineLatest,
  distinctUntilChanged,
  filter,
  first,
  map,
  type Observable,
  of,
  Subscription,
  switchMap,
  timer,
} from 'rxjs'

import {getTokenState} from '../auth/authStore'
import {getClient} from '../client/clientStore'
import {
  type DocumentResource,
  isCanvasResource,
  isDatasetResource,
  isMediaLibraryResource,
} from '../config/sanityConfig'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {type SanityUser} from '../users/types'
import {getUserState} from '../users/usersStore'
import {createBifurTransport} from './bifurTransport'
import {type PresenceLocation, type TransportEvent, type UserPresence} from './types'

const PRESENCE_API_VERSION = '2026-03-30'

/**
 * How long a session may go without announcing before it is dropped. Bifur
 * publishes nothing when a peer's socket dies, so a peer that crashes, is
 * force-quit, or loses power would otherwise stay visible forever.
 *
 * Peers re-announce every 30 seconds, so this allows three missed announcements.
 */
const SESSION_TTL = 90_000

/** How often to look for sessions that have gone quiet. */
const SWEEP_INTERVAL = 15_000

type PresenceSession = {
  userId: string
  locations: PresenceLocation[]
  /**
   * When we last heard from this session, on our own clock. Used for expiry in
   * preference to the sender's `lastActiveAt`, which is subject to clock skew:
   * a peer whose clock runs slow would otherwise be expired immediately, and one
   * whose clock runs fast would never be expired at all.
   */
  lastSeenAt: number
}

type PresenceStoreState = {
  locations: Map<string, PresenceSession>
  users: Record<string, SanityUser | undefined>
  organizationId?: string
  /**
   * Set when the canvas organization lookup fails. Without it, consumers waiting
   * on `organizationId` would wait forever.
   */
  organizationIdError?: unknown
}

const getInitialState = (): PresenceStoreState => ({
  locations: new Map<string, PresenceSession>(),
  users: {},
})

/** @public */
export const presenceStore = defineStore<PresenceStoreState, BoundResourceKey>({
  name: 'presence',
  getInitialState,
  initialize: (context: StoreContext<PresenceStoreState, BoundResourceKey>) => {
    const {
      instance,
      state,
      key: {resource},
    } = context

    if (isMediaLibraryResource(resource)) {
      throw new Error('Presence is not supported for media library resources.')
    }

    // A fresh id per store, deliberately not persisted. Reusing an id across
    // page loads would collide whenever a tab inherits another's session
    // storage (`window.open`, or a same-origin iframe), making two live clients
    // filter each other out as self. Stale sessions are handled by the
    // disconnect on unload, with the expiry sweep above as the backstop.
    const sessionId = crypto.randomUUID()

    // Dataset resources must use the project hostname so the socket URL is project-specific.
    // Canvas resources use the global API endpoint via the resource config.
    const client = isDatasetResource(resource)
      ? getClient(instance, {
          apiVersion: PRESENCE_API_VERSION,
          projectId: resource.projectId,
          dataset: resource.dataset,
          useProjectHostname: true,
        })
      : getClient(instance, {
          apiVersion: PRESENCE_API_VERSION,
          resource,
        })

    const token$ = getTokenState(instance).observable.pipe(distinctUntilChanged())

    const [incomingEvents$, dispatch, connections$, unload$] = createBifurTransport({
      client,
      token$,
      sessionId,
    })

    const subscription = new Subscription()

    subscription.add(
      incomingEvents$.subscribe((event: TransportEvent) => {
        if ('sessionId' in event && event.sessionId === sessionId) {
          return
        }

        if (event.type === 'state') {
          state.set('presence/state', (prevState: PresenceStoreState) => {
            const newLocations = new Map(prevState.locations)
            newLocations.set(event.sessionId, {
              userId: event.userId,
              locations: event.locations,
              lastSeenAt: Date.now(),
            })

            return {
              ...prevState,
              locations: newLocations,
            }
          })
        } else if (event.type === 'disconnect') {
          state.set('presence/disconnect', (prevState: PresenceStoreState) => {
            const newLocations = new Map(prevState.locations)
            newLocations.delete(event.sessionId)
            return {...prevState, locations: newLocations}
          })
        }
      }),
    )

    // Subscribing keeps the socket alive and reconnects it with backoff. Each
    // emission is a freshly live connection: anything we accumulated is now
    // suspect, so start over and ask everyone to announce themselves again.
    subscription.add(
      connections$.subscribe(() => {
        state.set('presence/reset', (prevState) => ({
          ...prevState,
          locations: new Map<string, PresenceSession>(),
        }))
        dispatch({type: 'rollCall'}).subscribe()
      }),
    )

    // Restarted per connection so a long reconnect backoff does not expire
    // everyone while we are offline — reconnecting clears the map anyway.
    subscription.add(
      connections$.pipe(switchMap(() => timer(SWEEP_INTERVAL, SWEEP_INTERVAL))).subscribe(() => {
        state.set('presence/expire', (prevState) => {
          const cutoff = Date.now() - SESSION_TTL
          const stale = [...prevState.locations].filter(([, s]) => s.lastSeenAt < cutoff)
          if (stale.length === 0) return prevState

          const newLocations = new Map(prevState.locations)
          for (const [staleSessionId] of stale) newLocations.delete(staleSessionId)
          return {...prevState, locations: newLocations}
        })
      }),
    )

    subscription.add(unload$.pipe(switchMap(() => dispatch({type: 'disconnect'}))).subscribe())

    // Canvas resources need the organizationId to resolve users — fetch it once from the canvas endpoint
    if (isCanvasResource(resource)) {
      const globalClient = getClient(instance, {apiVersion: PRESENCE_API_VERSION})
      subscription.add(
        globalClient.observable
          .request<{organizationId: string}>({
            uri: `/canvases/${resource.canvasId}`,
            tag: 'canvases.get',
          })
          .subscribe({
            next: ({organizationId}) => {
              state.set('presence/organizationId', (prev) => ({...prev, organizationId}))
            },
            error: (organizationIdError: unknown) => {
              state.set('presence/organizationIdError', (prev) => ({...prev, organizationIdError}))
            },
          }),
      )
    }

    return () => {
      dispatch({type: 'disconnect'}).subscribe()
      subscription.unsubscribe()
    }
  },
})

const selectLocations = (state: PresenceStoreState) => state.locations
const selectUsers = (state: PresenceStoreState) => state.users

/**
 * Stands in for a participant whose profile has not resolved yet, or cannot be
 * resolved. This must be a structurally valid `SanityUser`: consumers read
 * `user.profile`, and a partial object would throw there on first render.
 */
const createUnresolvedUser = (userId: string): SanityUser => ({
  sanityUserId: userId,
  profile: {
    id: userId,
    displayName: 'Unknown user',
    email: '',
    provider: '',
    createdAt: '',
  },
  memberships: [],
})

const selectPresence = createSelector(
  selectLocations,
  selectUsers,
  (locations, users): UserPresence[] => {
    return Array.from(locations.entries()).map(([sessionId, {userId, locations: locs}]) => ({
      user: users[userId] || createUnresolvedUser(userId),
      sessionId,
      locations: locs,
    }))
  },
)

const _getPresence = bindActionByResource(
  presenceStore,
  createStateSourceAction({
    selector: (context: SelectorContext<PresenceStoreState>): UserPresence[] =>
      selectPresence(context.state),
    onSubscribe: (context: StoreContext<PresenceStoreState, BoundResourceKey>) => {
      const resource = context.key.resource
      const userIds$ = context.state.observable.pipe(
        map((state) =>
          Array.from(state.locations.values())
            .map((l) => l.userId)
            .filter((id): id is string => !!id),
        ),
        distinctUntilChanged((a, b) => a.length === b.length && a.every((v, i) => v === b[i])),
      )

      // For canvas resources, wait for organizationId to be fetched and stored in state.
      // A failed lookup resolves to `undefined` rather than never emitting, so that
      // one failed request does not leave every user permanently unresolved.
      // For dataset resources, emit undefined immediately so the stream isn't blocked.
      const organizationId$: Observable<string | undefined> = isCanvasResource(resource)
        ? context.state.observable.pipe(
            filter((s) => s.organizationId !== undefined || s.organizationIdError !== undefined),
            first(),
            map((s) => s.organizationId),
          )
        : of(undefined)

      const subscription = combineLatest([userIds$, organizationId$])
        .pipe(
          switchMap(([userIds, organizationId]) => {
            if (userIds.length === 0) {
              return of([])
            }
            // Without an organization there is nothing to scope the lookup to,
            // so skip the request rather than making one that cannot succeed.
            if (!isDatasetResource(resource) && !organizationId) {
              return of([])
            }
            const userObservables = userIds.map((userId) =>
              getUserState(context.instance, {
                userId,
                ...(isDatasetResource(resource)
                  ? {resourceType: 'project', projectId: resource.projectId}
                  : {resourceType: 'organization', organizationId}),
              }).pipe(filter((v): v is NonNullable<typeof v> => !!v)),
            )
            return combineLatest(userObservables)
          }),
        )
        .subscribe((users) => {
          context.state.set('presence/users', (prevState) => ({
            ...prevState,
            users: {
              ...prevState.users,
              ...users.reduce<Record<string, SanityUser>>((acc, user) => {
                if (user) {
                  acc[user.profile.id] = user
                }
                return acc
              }, {}),
            },
          }))
        })
      return () => subscription.unsubscribe()
    },
  }),
)

/** @beta */
export function getPresence(
  instance: SanityInstance,
  params?: {resource?: DocumentResource},
): StateSource<UserPresence[]> {
  // bit of a hack to support the old bound action by dataset
  // in reality, this will always be passed a resource
  return _getPresence(instance, params ?? {})
}
