import {EMPTY, Observable, share, Subject, takeUntil} from 'rxjs'

import {getEnv} from '../utils/getEnv'
import {cleanupTimer} from '../utils/setCleanupTimeout'
import {type SanityInstance} from './createSanityInstance'
import {createStoreState, type StoreState} from './createStoreState'
import {type StoreDefinition} from './defineStore'

/**
 * How long a store keeps its upstream open after its last subscriber leaves.
 * Matches the query and document entry clear delays, and covers Strict Mode
 * double effects and Suspense flicker without reconnecting.
 */
export const UPSTREAM_CLOSE_DELAY_MS = 1000

/**
 * Represents a running instance of a store with its own state and lifecycle
 *
 * @remarks
 * Each StoreInstance is tied to a specific SanityInstance, manages its own state,
 * and can be independently disposed when no longer needed.
 */
export interface StoreInstance<TState> {
  /**
   * Access to the reactive state container for this store instance
   */
  state: StoreState<TState>

  /**
   * Checks if this store instance has been disposed
   * @returns Boolean indicating disposed state
   */
  isDisposed: () => void

  /**
   * Cleans up this store instance and runs any initialization cleanup functions
   * @remarks Triggers the cleanup function returned from the initialize method
   */
  dispose: () => void

  /**
   * The store's upstream subscription, shared by everything subscribed to it.
   * Emits nothing; subscribing keeps it open. Completes when the store is disposed.
   */
  upstream$: Observable<never>
}

/**
 * Creates a new instance of a store from a store definition
 *
 * @param instance - The Sanity instance this store will be associated with
 * @param storeDefinition - The store definition containing initial state and initialization logic
 * @returns A store instance with state management and lifecycle methods
 *
 * @remarks
 * The store instance maintains its own state that is scoped to the given Sanity instance.
 * If the store definition includes an initialize function, it will be called during
 * instance creation, and its cleanup function will be called during disposal.
 *
 * @example
 * ```ts
 * const counterStore = defineStore({
 *   name: 'Counter',
 *   getInitialState: () => ({ count: 0 }),
 *   initialize: ({state}) => {
 *     console.log('Counter store initialized')
 *     return () => console.log('Counter store disposed')
 *   }
 * })
 *
 * const instance = createStoreInstance(sanityInstance, counterStore)
 * // Later when done with the store:
 * instance.dispose()
 * ```
 */
export function createStoreInstance<TState, TKey extends {name: string}>(
  instance: SanityInstance,
  key: TKey,
  {name, getInitialState, initialize, upstream}: StoreDefinition<TState, TKey>,
): StoreInstance<TState> {
  const state = createStoreState(getInitialState(instance, key), {
    enabled: !!getEnv('DEV'),
    name: `${name}-${key.name}`,
  })
  const dispose = initialize?.({state, instance, key})
  const disposed = {current: false}

  const disposed$ = new Subject<void>()

  const upstream$ = upstream
    ? new Observable<never>((subscriber) => {
        if (disposed.current) return subscriber.complete()
        return upstream({state, instance, key})
      }).pipe(
        takeUntil(disposed$),
        share({
          resetOnComplete: false,
          resetOnRefCountZero: () => cleanupTimer(UPSTREAM_CLOSE_DELAY_MS),
        }),
      )
    : EMPTY

  return {
    state,
    upstream$,
    dispose: () => {
      if (disposed.current) return
      disposed.current = true
      // Before initialize's cleanup, which may own what upstream depends on
      disposed$.next()
      dispose?.()
    },
    isDisposed: () => disposed.current,
  }
}
