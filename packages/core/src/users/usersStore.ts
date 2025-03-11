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
  pairwise,
  race,
  skip,
  startWith,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ActionContext, createAction, createInternalAction} from '../resources/createAction'
import {createResource} from '../resources/createResource'
import {createStateSourceAction} from '../resources/createStateSourceAction'
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
export const usersStore = createResource<UsersStoreState>({
  name: 'UsersStore',
  getInitialState: () => ({users: {}}),
  initialize() {
    const subscription = listenForLoadMoreAndFetch(this)
    return () => subscription.unsubscribe()
  },
})

/**
 * Error handler for the users store.
 *
 * @internal
 */
export const errorHandler = createInternalAction(({state}: ActionContext<{error?: unknown}>) => {
  return function () {
    return (error: unknown) => state.set('setError', {error})
  }
})

/**
 * Internal action that listens for new user subscriptions and load more requests.
 * Fetches user data when new subscriptions are added or when loadMoreUsers is called.
 *
 * @internal
 */
const listenForLoadMoreAndFetch = createInternalAction(
  ({state, instance}: ActionContext<UsersStoreState>) => {
    return function () {
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
                const options = parseUsersKey(group$.key)

                const client$ = getClientState(instance, {
                  scope: 'global',
                  apiVersion: API_VERSION,
                  // TODO: looks like this endpoint doesn't accept tags
                  requestTagPrefix: undefined,
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

                return combineLatest([client$, loadMore$]).pipe(
                  withLatestFrom(cursor$),
                  switchMap(([[client], cursor]) =>
                    client.observable.request<SanityUserResponse>({
                      method: 'GET',
                      uri: `access/${options.resourceType}/${options.resourceId}/users`,
                      query: cursor
                        ? {nextCursor: cursor, limit: options.limit.toString()}
                        : {limit: options.limit.toString()},
                    }),
                  ),
                  catchError((error) => {
                    state.set('setUsersError', setUsersError(options, error))
                    return EMPTY
                  }),
                  tap((response) => state.set('setUsersData', setUsersData(options, response))),
                )
              }),
            ),
          ),
        )
        .subscribe({error: errorHandler(this)})
    }
  },
)

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
 * Note: Automatic cleanup can interfere with React Suspense because if a component suspends while
 * being the only subscriber, cleanup might occur unexpectedly. In such cases, consider using
 * `resolveUsers` instead.
 *
 * @beta
 */
export const getUsersState = createStateSourceAction(usersStore, {
  selector: createSelector(
    [
      (s: UsersStoreState, options: GetUsersOptions) =>
        s.error ?? s.users[getUsersKey(options)]?.error,
      (s: UsersStoreState, options: GetUsersOptions) => s.users[getUsersKey(options)]?.users,
      (s: UsersStoreState, options: GetUsersOptions) => s.users[getUsersKey(options)]?.totalCount,
      (s: UsersStoreState, options: GetUsersOptions) => s.users[getUsersKey(options)]?.nextCursor,
    ],
    (error, data, totalCount, nextCursor) => {
      if (error) throw error
      if (data === undefined || totalCount === undefined || nextCursor === undefined) {
        return undefined
      }

      return {data, totalCount, hasMore: nextCursor !== null}
    },
  ),
  onSubscribe: ({state}, options: GetUsersOptions) => {
    const subscriptionId = insecureRandomId()
    state.set('addSubscription', addSubscription(subscriptionId, options))
    return () => {
      setTimeout(
        () => state.set('removeSubscription', removeSubscription(subscriptionId, options)),
        USERS_STATE_CLEAR_DELAY,
      )
    }
  },
})

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
export const resolveUsers = createAction(usersStore, ({state}) => {
  return async function ({signal, ...options}: ResolveUsersOptions) {
    const {getCurrent} = getUsersState(this, options)

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
              state.set('cancelRequest', cancelRequest(options))
            }
            throw error
          }),
        )
      : NEVER

    state.set('initializeRequest', initializeRequest(options))

    const resolved$ = state.observable.pipe(
      map(getCurrent),
      first((i) => i !== undefined),
    )

    return firstValueFrom(race([resolved$, aborted$]))
  }
})

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
export const loadMoreUsers = createAction(usersStore, ({state}) => {
  return async function (options: GetUsersOptions) {
    const users = getUsersState(this, options)
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
    state.set('updateLastLoadMoreRequest', updateLastLoadMoreRequest(timestamp, options))

    return await promise
  }
})
