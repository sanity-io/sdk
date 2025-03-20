import {distinctUntilChanged, map, Observable, share, skip} from 'rxjs'

import {type StoreAction} from './createActionBinder'
import {type SanityInstance} from './createSanityInstance'
import {type StoreContext} from './defineStore'

/**
 * Represents a reactive state source that provides synchronized access to store data
 *
 * @remarks
 * Designed to work with React's useSyncExternalStore hook. Provides three ways to access data:
 * 1. `getCurrent()` for synchronous current value access
 * 2. `subscribe()` for imperative change notifications
 * 3. `observable` for reactive stream access
 *
 * @public
 */
export interface StateSource<T> {
  /**
   * Subscribes to state changes with optional callback
   * @param onStoreChanged - Called whenever relevant state changes occur
   * @returns Unsubscribe function to clean up the subscription
   */
  subscribe: (onStoreChanged?: () => void) => () => void

  /**
   * Gets the current derived state value
   *
   * @remarks
   * Safe to call without subscription. Will always return the latest value
   * based on the current store state and selector parameters.
   */
  getCurrent: () => T

  /**
   * Observable stream of state values
   *
   * @remarks
   * Shares a single underlying subscription between all observers. Emits:
   * - Immediately with current value on subscription
   * - On every relevant state change
   * - Errors if selector throws
   */
  observable: Observable<T>
}

/**
 * Context passed to selectors when deriving state
 *
 * @remarks
 * Provides access to both the current state value and the Sanity instance,
 * allowing selectors to use configuration values when computing derived state.
 * The context is memoized for each state object and instance combination
 * to optimize performance and prevent unnecessary recalculations.
 *
 * @example
 * ```ts
 * // Using both state and instance in a selector (psuedo example)
 * const getUserByProjectId = createStateSourceAction(
 *   ({ state, instance }: SelectorContext<UsersState>, options?: ProjectHandle) => {
 *     const allUsers = state.users
 *     const projectId = options?.projectId ?? instance.config.projectId
 *     return allUsers.filter(user => user.projectId === projectId)
 *   }
 * )
 * ```
 */
export interface SelectorContext<TState> {
  /**
   * The current state object from the store
   */
  state: TState

  /**
   * The Sanity instance associated with this state
   */
  instance: SanityInstance
}

/**
 * Function type for selecting derived state from store state and parameters
 * @public
 */
export type Selector<TState, TParams extends unknown[], TReturn> = (
  context: SelectorContext<TState>,
  ...params: TParams
) => TReturn

/**
 * Configuration options for creating a state source action
 */
interface StateSourceOptions<TState, TParams extends unknown[], TReturn> {
  /**
   * Selector function that derives the desired value from store state
   *
   * @remarks
   * Will be called on every store change. Should be pure function.
   * Thrown errors will propagate to observable subscribers.
   */
  selector: Selector<TState, TParams, TReturn>

  /**
   * Optional setup/cleanup handler for subscriptions
   *
   * @param context - Store context containing state and instance
   * @param params - Action parameters provided during invocation
   * @returns Optional cleanup function called when subscription ends
   */
  onSubscribe?: (context: StoreContext<TState>, ...params: TParams) => void | (() => void)

  /**
   * Equality function to prevent unnecessary updates
   */
  isEqual?: (prev: TReturn, curr: TReturn) => boolean
}

/**
 * Creates a state source action that generates StateSource instances
 *
 * @remarks
 * The returned action can be bound to a store using createActionBinder.
 * When invoked, returns a StateSource that stays synchronized with the store.
 *
 * Key performance features:
 * - Memoizes selector contexts to prevent redundant object creation
 * - Only runs selectors when the underlying state changes
 *
 * For complex data transformations, consider using memoized selectors
 * (like those from Reselect) to prevent expensive recalculations.
 *
 * @example
 * ```ts
 * // Create a simple counter source
 * const getCount = createStateSourceAction(({state}: SelectorContext<CounterState>) => state.count)
 * ```
 *
 * @example
 * ```ts
 * // Create a parameterized source with setup/cleanup
 * const getItem = createStateSourceAction({
 *   selector: ({state}, index: number) => state.items[index],
 *   onSubscribe: (context, index) => {
 *     trackItemSubscription(index)
 *     return () => untrackItem(index)
 *   }
 * })
 * ```
 *
 * @example
 * ```ts
 * // Binding a state source to a specific store
 * const documentStore = defineStore<DocumentState>({
 *   name: 'Documents',
 *   getInitialState: () => ({ documents: {} }),
 *   // ...
 * })
 *
 * const getDocument = bindActionByDataset(
 *   documentStore,
 *   createStateSourceAction(({state}, documentId: string) => state.documents[documentId])
 * )
 *
 * // Usage
 * const documentSource = getDocument(sanityInstance, 'doc123')
 * const doc = documentSource.getCurrent()
 * const subscription = documentSource.observable.subscribe(updatedDoc => {
 *   console.log('Document changed:', updatedDoc)
 * })
 * ```
 */
export function createStateSourceAction<TState, TParams extends unknown[], TReturn>(
  options: Selector<TState, TParams, TReturn> | StateSourceOptions<TState, TParams, TReturn>,
): StoreAction<TState, TParams, StateSource<TReturn>> {
  const selector = typeof options === 'function' ? options : options.selector
  const subscribeHandler = options && 'onSubscribe' in options ? options.onSubscribe : undefined
  const isEqual = options && 'isEqual' in options ? (options.isEqual ?? Object.is) : Object.is
  const selectorContextCache = new WeakMap<
    object,
    WeakMap<SanityInstance, SelectorContext<TState>>
  >()

  /**
   * The state source action implementation
   * @param context - Store context providing access to state and instance
   * @param params - Parameters provided when invoking the bound action
   */
  function stateSourceAction(context: StoreContext<TState>, ...params: TParams) {
    const {state, instance} = context

    const getCurrent = () => {
      const currentState = state.get()
      if (typeof currentState !== 'object' || currentState === null) {
        throw new Error(
          `Expected store state to be an object but got "${typeof currentState}" instead`,
        )
      }

      let instanceCache = selectorContextCache.get(currentState)
      if (!instanceCache) {
        instanceCache = new WeakMap<SanityInstance, SelectorContext<TState>>()
        selectorContextCache.set(currentState, instanceCache)
      }
      let selectorContext = instanceCache.get(instance)
      if (!selectorContext) {
        selectorContext = {state: currentState, instance}
        instanceCache.set(instance, selectorContext)
      }
      return selector(selectorContext, ...params)
    }

    // Subscription manager handles both RxJS and direct subscriptions
    const subscribe = (onStoreChanged?: () => void) => {
      // Run setup handler if provided
      const cleanup = subscribeHandler?.(context, ...params)

      // Set up state change subscription
      const subscription = state.observable
        .pipe(
          // Derive value from current state
          map(getCurrent),
          // Filter unchanged values using custom equality check
          distinctUntilChanged(isEqual),
          // Skip initial emission since we only want changes
          skip(1),
        )
        .subscribe({
          next: () => onStoreChanged?.(),
          // Propagate selector errors to both subscription types
          error: () => onStoreChanged?.(),
        })

      return () => {
        subscription.unsubscribe()
        cleanup?.()
      }
    }

    // Create shared observable that handles multiple subscribers efficiently
    const observable = new Observable<TReturn>((observer) => {
      const emitCurrent = () => {
        try {
          observer.next(getCurrent())
        } catch (error) {
          observer.error(error)
        }
      }
      // Emit immediately on subscription
      emitCurrent()
      return subscribe(emitCurrent)
    }).pipe(share())

    return {
      getCurrent,
      subscribe,
      observable,
    }
  }

  return stateSourceAction
}
