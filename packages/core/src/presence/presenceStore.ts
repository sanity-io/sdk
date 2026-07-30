import {createSelector} from 'reselect'
import {
  auditTime,
  catchError,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  filter,
  first,
  map,
  merge,
  type Observable,
  of,
  Subscription,
  switchMap,
  timer,
  withLatestFrom,
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
import {createLogger} from '../utils/logger'
import {createBifurTransport} from './bifurTransport'
import {
  type PresenceLocation,
  type ReportPresenceOptions,
  type TransportEvent,
  type TransportMessage,
  type UserPresence,
  type WirePresenceLocation,
} from './types'

const logger = createLogger('presence')

/**
 * Used for the canvas organization lookup only. The socket itself is pinned to
 * `2022-06-30` in `bifurTransport`, because that is the version Bifur compares
 * against when deciding whether a connection may authenticate over RPC rather
 * than requiring a JWT at upgrade. Do not align these two.
 */
const PRESENCE_API_VERSION = '2026-03-30'

/**
 * How often the current user re-announces while idle. Matches the Studio so the
 * two agree on how long a quiet peer should be trusted.
 */
const REPORT_MIN_INTERVAL = 30_000

/** Collapses a burst of focus changes into a single announcement. */
const REPORT_AUDIT_TIME = 200

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
  /**
   * Where this client says it is. `undefined` means the app has never reported,
   * which keeps it silent: reading presence must not make an app start
   * broadcasting. An empty array is different, and means "here, but not in any
   * particular document".
   */
  localLocations?: WirePresenceLocation[]
}

const getInitialState = (): PresenceStoreState => ({
  locations: new Map<string, PresenceSession>(),
  users: {},
})

/**
 * Sends a message without letting a failure tear down the stream it was sent on.
 *
 * This matters most for the announce pipeline, which carries the idle heartbeat,
 * roll-call responses, and the re-announce on reconnect. Those share one chain, so
 * an unhandled error from a single rejected RPC would silence this client
 * permanently while it carried on reading presence normally. A dropped socket
 * errors the in-flight request, which is exactly the case where staying alive
 * matters, since the reconnect that follows is what makes us visible again.
 *
 * No retry is needed here. The 30 second heartbeat sends again on its own, and a
 * recovered connection triggers an immediate re-announce.
 */
const sendSafely = (
  dispatch: (message: TransportMessage) => Observable<void>,
  message: TransportMessage,
): Observable<void> =>
  dispatch(message).pipe(
    catchError((error: unknown) => {
      logger.warn('Failed to send presence message', {messageType: message.type, error})
      return EMPTY
    }),
  )

/** Ignores `lastActiveAt`, which changes on every report even when nothing moved. */
const locationKey = ({documentId, path, selection}: WirePresenceLocation) =>
  JSON.stringify([documentId, path, selection ?? null])

/**
 * Compares reported locations by value. Key order within a caller-supplied
 * `selection` could in principle differ and read as a change, which costs one
 * extra announcement and nothing else.
 */
function isEqualLocations(
  a: WirePresenceLocation[] | undefined,
  b: WirePresenceLocation[] | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((location, index) => locationKey(location) === locationKey(b[index]))
}

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

    // Subscribed before the roll call below, deliberately. The transport
    // establishes its listener when this stream is subscribed, and a roll call
    // sent before we are listening would have its answers arrive to no one.
    subscription.add(
      incomingEvents$.subscribe({
        next: (event: TransportEvent) => {
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
        },
        // The transport re-establishes its listener on every live connection, so
        // this should not fire. Handled rather than left to become an unhandled
        // error, which is how presence used to die silently and for good.
        error: (error: unknown) => {
          logger.error('Presence event stream failed', {error})
        },
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
        sendSafely(dispatch, {type: 'rollCall'}).subscribe()
      }),
    )

    // Restarted per connection so a long reconnect backoff does not expire
    // everyone while we are offline — reconnecting clears the map anyway.
    //
    // Uses an rxjs timer rather than `setCleanupTimeout`, despite the guidance in
    // core-package-conventions, because this is a recurring sweep and not a
    // cleanup timer. Unref'ing it would not help anyway: a live presence
    // subscription holds an open WebSocket, and that is what keeps a Node process
    // alive. Anything running server-side should not subscribe to presence at all.
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

    subscription.add(
      unload$.pipe(switchMap(() => sendSafely(dispatch, {type: 'disconnect'}))).subscribe(),
    )

    // Announce where we are. A location change, a peer asking for a roll call, or
    // a reconnect all restart `timer(0, ...)`, so we announce immediately and then
    // every 30s while idle. That idle tick is what tells peers we are still here,
    // and is what their expiry sweep measures against.
    const localLocations$ = state.observable.pipe(
      map((s) => s.localLocations),
      // Compared by value, not by reference. The Studio compares by reference and
      // so never dedupes, because its form rebuilds the array on every call.
      distinctUntilChanged(isEqualLocations),
    )

    const rollCallRequests$ = incomingEvents$.pipe(
      // Bifur echoes our own roll call back to us, since we are subscribed to the
      // same topic we published to. Answering it would be a pointless round trip.
      filter((event) => event.type === 'rollCall' && event.sessionId !== sessionId),
    )

    subscription.add(
      merge(localLocations$, rollCallRequests$, connections$)
        .pipe(
          switchMap(() => timer(0, REPORT_MIN_INTERVAL)),
          withLatestFrom(localLocations$),
          map(([, locations]) => locations),
          // Stay silent until the app has reported at least once.
          filter((locations): locations is WirePresenceLocation[] => locations !== undefined),
          auditTime(REPORT_AUDIT_TIME),
          switchMap((locations) => sendSafely(dispatch, {type: 'state', locations})),
        )
        .subscribe(),
    )

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
      sendSafely(dispatch, {type: 'disconnect'}).subscribe()
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

const _reportPresence = bindActionByResource(
  presenceStore,
  (
    {state}: StoreContext<PresenceStoreState, BoundResourceKey>,
    {locations}: {resource?: DocumentResource; locations: ReportPresenceOptions[]},
  ) => {
    const lastActiveAt = new Date().toISOString()
    const wireLocations: WirePresenceLocation[] = locations.map(
      ({documentId, path = [], selection}) => ({
        type: 'document',
        documentId,
        path,
        lastActiveAt,
        ...(selection === undefined ? {} : {selection}),
      }),
    )

    state.set('presence/report', (prevState) => ({...prevState, localLocations: wireLocations}))
  },
)

/**
 * Announces where the current user is, so other clients in the same project and
 * dataset can show them. Reading presence never announces anything, so this is
 * the only way an app becomes visible to others.
 *
 * Call it again whenever the user moves. Announcements are collapsed over a short
 * window and then repeated every 30 seconds while idle, which is what tells peers
 * the session is still alive.
 *
 * @param instance - the Sanity instance
 * @param params - the resource to announce on, plus the locations to report.
 *   Pass one location with a `documentId` for document-level presence, add a
 *   `path` for field-level presence, and pass an empty array to appear present
 *   without being in any document.
 *
 * @beta
 */
export function reportPresence(
  instance: SanityInstance,
  params: {resource?: DocumentResource; locations: ReportPresenceOptions[]},
): void {
  return _reportPresence(instance, params)
}
