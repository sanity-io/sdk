import {createSelector} from 'reselect'
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  filter,
  first,
  map,
  type Observable,
  of,
  Subscription,
  switchMap,
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

type PresenceStoreState = {
  locations: Map<string, {userId: string; locations: PresenceLocation[]}>
  users: Record<string, SanityUser | undefined>
  organizationId?: string
}

const getInitialState = (): PresenceStoreState => ({
  locations: new Map<string, {userId: string; locations: PresenceLocation[]}>(),
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

    const [incomingEvents$, dispatch] = createBifurTransport({
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

    dispatch({type: 'rollCall'}).subscribe()

    // Canvas resources need the organizationId to resolve users — fetch it once from the canvas endpoint
    if (isCanvasResource(resource)) {
      const globalClient = getClient(instance, {apiVersion: PRESENCE_API_VERSION})
      subscription.add(
        globalClient.observable
          .request<{organizationId: string}>({
            uri: `/canvases/${resource.canvasId}`,
            tag: 'canvases.get',
          })
          .pipe(catchError(() => EMPTY))
          .subscribe(({organizationId}) => {
            state.set('presence/organizationId', (prev) => ({...prev, organizationId}))
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

const selectPresence = createSelector(
  selectLocations,
  selectUsers,
  (locations, users): UserPresence[] => {
    return Array.from(locations.entries()).map(([sessionId, {userId, locations: locs}]) => {
      const user = users[userId]

      return {
        user:
          user ||
          ({
            id: userId,
            displayName: 'Unknown user',
            name: 'Unknown user',
            email: '',
          } as unknown as SanityUser),
        sessionId,
        locations: locs,
      }
    })
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
      // For dataset resources, emit undefined immediately so the stream isn't blocked.
      const organizationId$: Observable<string | undefined> = isCanvasResource(resource)
        ? context.state.observable.pipe(
            map((s) => s.organizationId),
            filter((id): id is string => id !== undefined),
            first(),
          )
        : of(undefined)

      const subscription = combineLatest([userIds$, organizationId$])
        .pipe(
          switchMap(([userIds, organizationId]) => {
            if (userIds.length === 0) {
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
