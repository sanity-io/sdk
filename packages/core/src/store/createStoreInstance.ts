import {getEnv} from '../utils/getEnv'
import {type SanityInstance} from './createSanityInstance'
import {createStoreState, type StoreState} from './createStoreState'
import {type StoreDefinition} from './defineStore'

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
export function createStoreInstance<TState>(
  instance: SanityInstance,
  {name, getInitialState, initialize}: StoreDefinition<TState>,
): StoreInstance<TState> {
  const state = createStoreState(getInitialState(instance), {
    enabled: !!getEnv('DEV'),
    name: `${name}-${instance.config.projectId}.${instance.config.dataset}`,
  })
  const dispose = initialize?.({state, instance})
  const disposed = {current: false}

  return {
    state,
    dispose: () => {
      if (disposed.current) return
      disposed.current = true
      dispose?.()
    },
    isDisposed: () => disposed.current,
  }
}
