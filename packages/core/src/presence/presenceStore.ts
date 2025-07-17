import {type SanityClient} from '@sanity/client'
import {createSelector} from 'reselect'
import {combineLatest, distinctUntilChanged, filter, map, of, Subscription, switchMap} from 'rxjs'

import {getTokenState} from '../auth/authStore'
import {getClient} from '../client/clientStore'
import {bindActionByDataset} from '../store/createActionBinder'
import {createStateSourceAction, type SelectorContext} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {type SanityUser} from '../users/types'
import {getUserState} from '../users/usersStore'
import {createBifurTransport} from './bifurTransport'
import {type PresenceLocation, type TransportEvent, type UserPresence} from './types'

type PresenceStoreState = {
  locations: Map<string, {userId: string; locations: PresenceLocation[]}>
  users: Record<string, SanityUser | undefined>
}

const getInitialState = (): PresenceStoreState => ({
  locations: new Map<string, {userId: string; locations: PresenceLocation[]}>(),
  users: {},
})

/** @public */
export const presenceStore = defineStore<PresenceStoreState>({
  name: 'presence',
  getInitialState,
  initialize: (context: StoreContext<PresenceStoreState>) => {
    const {instance, state} = context
    const sessionId = crypto.randomUUID()

    const client = getClient(instance, {
      apiVersion: '2022-06-30',
    })

    const token$ = getTokenState(instance).observable.pipe(distinctUntilChanged())

    const [incomingEvents$, dispatch] = createBifurTransport({
      client: client as SanityClient,
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

/** @public */
export const getPresence = bindActionByDataset(
  presenceStore,
  createStateSourceAction({
    selector: (context: SelectorContext<PresenceStoreState>): UserPresence[] =>
      selectPresence(context.state),
    onSubscribe: (context) => {
      const userIds$ = context.state.observable.pipe(
        map((state) =>
          Array.from(state.locations.values())
            .map((l) => l.userId)
            .filter((id): id is string => !!id),
        ),
        distinctUntilChanged((a, b) => a.length === b.length && a.every((v, i) => v === b[i])),
      )

      const subscription = userIds$
        .pipe(
          switchMap((userIds) => {
            if (userIds.length === 0) {
              return of([])
            }
            const userObservables = userIds.map((userId) =>
              getUserState(context.instance, {
                userId,
                resourceType: 'project',
                projectId: context.instance.config.projectId,
              }).pipe(filter((v): v is NonNullable<typeof v> => !!v)),
            )
            return combineLatest(userObservables)
          }),
        )
        .subscribe((users) => {
          if (!users) {
            return
          }
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
