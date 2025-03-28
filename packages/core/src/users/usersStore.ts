import {createSelector} from 'reselect'
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  filter,
  first,
  firstValueFrom,
  groupBy,
  map,
  mergeMap,
  NEVER,
  Observable,
  of,
  pairwise,
  race,
  skip,
  startWith,
  switchMap,
  tap,
  throwError,
  withLatestFrom,
} from 'rxjs'

import {getDashboardOrganizationId} from '../auth/authStore'
import {getClientState} from '../client/clientStore'
import {bindActionGlobally} from '../store/createActionBinder'
import {createStateSourceAction, type SelectorContext} from '../store/createStateSourceAction'
import {type StoreState} from '../store/createStoreState'
import {defineStore, type StoreContext} from '../store/defineStore'
import {insecureRandomId} from '../utils/ids'
import {
  addSubscription,
  cancelRequest,
  getUsersKey,
  initializeRequest,
  parseUsersKey,
  removeSubscription,
  setUsersData,
  setUsersError,
  updateLastLoadMoreRequest,
} from './reducers'
import {
  type GetUsersOptions,
  type ResolveUsersOptions,
  type SanityUserResponse,
  type UsersStoreState,
} from './types'
import {API_VERSION, USERS_STATE_CLEAR_DELAY} from './usersConstants'

/**
 * The users store resource that manages user data fetching and state.
 *
 * This store handles fetching, caching, and managing user data. It provides functionality for
 * retrieving users associated with specific resources and supports pagination through the
 * `loadMoreUsers` action.
 *
 * @internal
 */
const usersStore = defineStore<UsersStoreState>({
  name: 'UsersStore',
  getInitialState: () => ({users: {}}),
  initialize: (context) => {
    const subscription = listenForLoadMoreAndFetch(context)
    return () => subscription.unsubscribe()
  },
})

const errorHandler =
  (state: StoreState<{error?: unknown}>) =>
  (error: unknown): void =>
    state.set('setError', {error})

/**
 * Internal action that listens for new user subscriptions and load more requests.
 * Fetches user data when new subscriptions are added or when loadMoreUsers is called.
 */
const listenForLoadMoreAndFetch = ({state, instance}: StoreContext<UsersStoreState>) => {
  return state.observable
    .pipe(
      map((s) => new Set(Object.keys(s.users))),
      distinctUntilChanged((curr, next) => {
        if (curr.size !== next.size) return false
        return Array.from(next).every((i) => curr.has(i))
      }),
      startWith(new Set<string>()),
      pairwise(),
      mergeMap(([curr, next]) => {
        const added = Array.from(next).filter((i) => !curr.has(i))
        const removed = Array.from(curr).filter((i) => !next.has(i))

        return [
          ...added.map((key) => ({key, added: true})),
          ...removed.map((key) => ({key, added: false})),
        ]
      }),
      groupBy((i) => i.key),
      mergeMap((group$) =>
        group$.pipe(
          switchMap((e) => {
            if (!e.added) return EMPTY
            const {batchSize, ...options} = parseUsersKey(group$.key)

            const projectId = options.projectId ?? instance.config.projectId

            // the resource type this request will use
            // If resourceType is explicitly provided, use it
            // Otherwise, infer from context: organization if organizationId exists,
            // project if projectId exists, or default to organization
            const resourceType =
              options.resourceType ??
              (options.organizationId ? 'organization' : projectId ? 'project' : 'organization')

            const organizationId$ = options.organizationId
              ? of(options.organizationId)
              : getDashboardOrganizationId(instance).observable.pipe(
                  filter((i) => typeof i === 'string'),
                )

            const resource$: Observable<{
              type: 'project' | 'organization'
              id: string
            }> =
              resourceType === 'project'
                ? projectId
                  ? of({type: 'project', id: projectId})
                  : throwError(() => new Error('Project ID required for this API.'))
                : organizationId$.pipe(map((id) => ({type: 'organization', id})))

            const client$ = getClientState(instance, {
              scope: 'global',
              apiVersion: API_VERSION,
            }).observable

            const loadMore$ = state.observable.pipe(
              map((s) => s.users[group$.key]?.lastLoadMoreRequest),
              distinctUntilChanged(),
            )

            const cursor$ = state.observable.pipe(
              map((s) => s.users[group$.key]?.nextCursor),
              distinctUntilChanged(),
              filter((cursor) => cursor !== null),
            )

            return combineLatest([resource$, client$, loadMore$]).pipe(
              withLatestFrom(cursor$),
              switchMap(([[resource, client], cursor]) =>
                client.observable.request<SanityUserResponse>({
                  method: 'GET',
                  uri: `access/${resource.type}/${resource.id}/users`,
                  query: cursor
                    ? {nextCursor: cursor, limit: batchSize.toString()}
                    : {limit: batchSize.toString()},
                }),
              ),
              catchError((error) => {
                state.set('setUsersError', setUsersError(group$.key, error))
                return EMPTY
              }),
              tap((response) => state.set('setUsersData', setUsersData(group$.key, response))),
            )
          }),
        ),
      ),
    )
    .subscribe({error: errorHandler(state)})
}

/**
 * Returns the state source for users associated with a specific resource.
 *
 * This function returns a state source that represents the current list of users for a given
 * resource. Subscribing to the state source will instruct the SDK to fetch the users (if not
 * already fetched) and will load more from this state source as well. When the last subscriber is
 * removed, the users state is automatically cleaned up from the store after a delay.
 *
 * Note: This functionality is for advanced users who want to build their own framework
 * integrations. Our SDK also provides a React integration for convenient usage.
 *
 * @beta
 */
export const getUsersState = bindActionGlobally(
  usersStore,
  createStateSourceAction({
    selector: createSelector(
      [
        ({instance, state}: SelectorContext<UsersStoreState>, options?: GetUsersOptions) =>
          state.error ?? state.users[getUsersKey(instance, options)]?.error,
        ({instance, state}: SelectorContext<UsersStoreState>, options: GetUsersOptions) =>
          state.users[getUsersKey(instance, options)]?.users,
        ({instance, state}: SelectorContext<UsersStoreState>, options: GetUsersOptions) =>
          state.users[getUsersKey(instance, options)]?.totalCount,
        ({instance, state}: SelectorContext<UsersStoreState>, options: GetUsersOptions) =>
          state.users[getUsersKey(instance, options)]?.nextCursor,
      ],
      (error, data, totalCount, nextCursor) => {
        if (error) throw error
        if (data === undefined || totalCount === undefined || nextCursor === undefined) {
          return undefined
        }

        return {data, totalCount, hasMore: nextCursor !== null}
      },
    ),
    onSubscribe: ({instance, state}, options?: GetUsersOptions) => {
      const subscriptionId = insecureRandomId()
      const key = getUsersKey(instance, options)
      state.set('addSubscription', addSubscription(subscriptionId, key))
      return () => {
        setTimeout(
          () => state.set('removeSubscription', removeSubscription(subscriptionId, key)),
          USERS_STATE_CLEAR_DELAY,
        )
      }
    },
  }),
)

/**
 * Resolves the users for a specific resource without registering a lasting subscriber.
 *
 * This function fetches the users for a given resource and returns a promise that resolves with
 * the users result. Unlike `getUsersState`, which registers subscribers to keep the data live and
 * performs automatic cleanup, `resolveUsers` does not track subscribers. This makes it ideal for
 * use with React Suspense, where the returned promise is thrown to delay rendering until the users
 * result becomes available. Once the promise resolves, it is expected that a real subscriber will
 * be added via `getUsersState` to manage ongoing updates.
 *
 * Additionally, an optional AbortSignal can be provided to cancel the request and immediately
 * clear the associated state if there are no active subscribers.
 *
 * @beta
 */
export const resolveUsers = bindActionGlobally(
  usersStore,
  async ({state, instance}, {signal, ...options}: ResolveUsersOptions) => {
    const key = getUsersKey(instance, options)
    const {getCurrent} = getUsersState(instance, options)

    const aborted$ = signal
      ? new Observable<never>((observer) => {
          const cleanup = () => {
            signal.removeEventListener('abort', listener)
          }

          const listener = () => {
            observer.error(new DOMException('The operation was aborted.', 'AbortError'))
            observer.complete()
            cleanup()
          }
          signal.addEventListener('abort', listener)

          return cleanup
        }).pipe(
          catchError((error) => {
            if (error instanceof Error && error.name === 'AbortError') {
              state.set('cancelRequest', cancelRequest(key))
            }
            throw error
          }),
        )
      : NEVER

    state.set('initializeRequest', initializeRequest(key))

    const resolved$ = state.observable.pipe(
      map(getCurrent),
      first((i) => i !== undefined),
    )

    return firstValueFrom(race([resolved$, aborted$]))
  },
)

/**
 * Loads more users for a specific resource.
 *
 * This function triggers a request to fetch the next page of users for a given resource. It
 * requires that users have already been loaded for the resource (via `resolveUsers` or
 * `getUsersState`), and that there are more users available to load (as indicated by the `hasMore`
 * property).
 *
 * The function returns a promise that resolves when the next page of users has been loaded.
 *
 * @beta
 */
export const loadMoreUsers = bindActionGlobally(
  usersStore,
  async ({state, instance}, options?: GetUsersOptions) => {
    const key = getUsersKey(instance, options)
    const users = getUsersState(instance, options)
    const usersState = users.getCurrent()
    if (!usersState) {
      throw new Error('Users not loaded for specified resource. Please call resolveUsers first.')
    }

    if (!usersState.hasMore) {
      throw new Error('No more users available to load for this resource.')
    }

    const promise = firstValueFrom(
      users.observable.pipe(
        filter((i) => i !== undefined),
        skip(1),
      ),
    )

    const timestamp = new Date().toISOString()
    state.set('updateLastLoadMoreRequest', updateLastLoadMoreRequest(timestamp, key))

    return await promise
  },
)
