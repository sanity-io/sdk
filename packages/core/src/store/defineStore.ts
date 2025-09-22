import {type SanityInstance} from './createSanityInstance'
import {type StoreState} from './createStoreState'

/**
 * Context object provided to store initialization functions
 */
export interface StoreContext<TState, TKey = unknown> {
  /**
   * Sanity instance associated with this store
   *
   * @remarks
   * Provides access to the Sanity configuration and instance lifecycle methods
   */
  instance: SanityInstance

  /**
   * Reactive store state management utilities
   *
   * @remarks
   * Contains methods for getting/setting state and observing changes
   */
  state: StoreState<TState>

  /**
   * The key used to instantiate the store.
   */
  key: TKey
}

/**
 * Defines the structure and behavior of a store
 *
 * @remarks
 * Stores are isolated state containers that can be associated with Sanity instances.
 * Each store definition creates a separate state instance per composite key.
 */
export interface StoreDefinition<TState, TKey = unknown> {
  /**
   * Unique name for the store
   *
   * @remarks
   * Used for debugging, devtools integration, and store identification
   */
  name: string

  /**
   * Creates the initial state for the store
   * @param instance - Sanity instance the store is being created for
   * @returns Initial state value
   *
   * @remarks
   * Called when a new store instance is created. Can use Sanity instance
   * configuration to determine initial state.
   */
  getInitialState: (instance: SanityInstance, key: TKey) => TState

  /**
   * Optional initialization function
   * @param context - Store context with state and instance access
   * @returns Optional cleanup function for store disposal
   *
   * @remarks
   * Use this for:
   * - Setting up event listeners
   * - Initial data fetching
   * - Connecting external services
   *
   * Return a cleanup function to:
   * - Remove event listeners
   * - Cancel pending operations
   * - Dispose external connections
   */
  initialize?: (context: StoreContext<TState, TKey>) => (() => void) | undefined
}

/**
 * Typescript helper function for creating store definitions
 *
 * @param storeDefinition - Configuration object defining the store
 * @returns The finalized store definition
 */
export function defineStore<TState, TKey = unknown>(
  storeDefinition: StoreDefinition<TState, TKey>,
): StoreDefinition<TState, TKey> {
  return storeDefinition
}
