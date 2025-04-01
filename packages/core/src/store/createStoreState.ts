import {Observable} from 'rxjs'
import {devtools, type DevtoolsOptions} from 'zustand/middleware'
import {createStore} from 'zustand/vanilla'

/**
 * Represents a reactive store state container with multiple access patterns
 */
export interface StoreState<TState> {
  /**
   * Gets the current state value
   *
   * @remarks
   * This is a direct synchronous accessor that doesn't trigger subscriptions
   */
  get: () => TState

  /**
   * Updates the store state
   * @param name - Action name for devtools tracking
   * @param updatedState - New state value or updater function
   *
   * @remarks
   * When providing a partial object, previous top-level keys not included in
   * the update will be preserved.
   */
  set: (name: string, updatedState: Partial<TState> | ((s: TState) => Partial<TState>)) => void

  /**
   * Observable stream of state changes
   * @remarks
   * - Emits immediately with current state on subscription
   * - Shares underlying subscription between observers
   * - Only emits when state reference changes
   * - Completes when store is disposed
   */
  observable: Observable<TState>
}

/**
 * Creates a reactive store state container with multiple access patterns
 * @param initialState - Initial state value for the store
 * @param devToolsOptions - Configuration for Zustand devtools integration
 * @returns StoreState instance with get/set/observable interface
 *
 * @example
 * ```typescript
 * // Create a simple counter store
 * const counterStore = createStoreState({ count: 0 });
 *
 * // Update state
 * counterStore.set('increment', { count: 1 });
 *
 * // Observe changes
 * counterStore.observable.subscribe(console.log);
 * ```
 *
 * @remarks
 * Uses Zustand for state management under the hood with RxJS for observable interface.
 * Designed to work with both imperative and reactive programming patterns.
 */
export function createStoreState<TState>(
  initialState: TState,
  devToolsOptions?: DevtoolsOptions,
): StoreState<TState> {
  // Create underlying Zustand store with devtools integration
  const store = createStore<TState>()(devtools(() => initialState, devToolsOptions))

  return {
    get: store.getState,
    set: (actionKey, updatedState) => {
      const currentState = store.getState()
      const nextState =
        typeof updatedState === 'function' ? updatedState(currentState) : updatedState

      // Optimization: Skip update if state reference remains the same
      if (currentState !== nextState) {
        store.setState(nextState, false, actionKey)
      }
    },
    observable: new Observable((observer) => {
      // Emit current state immediately on subscription
      const emit = () => observer.next(store.getState())
      emit()

      // Subscribe to Zustand store changes
      const unsubscribe = store.subscribe(emit)

      // Cleanup when observable unsubscribed
      return () => unsubscribe()
    }),
  }
}
