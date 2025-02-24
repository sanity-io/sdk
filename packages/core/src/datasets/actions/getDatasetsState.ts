import {createAction} from '../../resources/createAction'
import {datasetsStore} from '../datasetsStore'

/**
 * @internal
 *
 * Returns the current dataset state and provides a subscription mechanism for listening to changes.
 *
 * @remarks
 * This action is marked as internal and should not be used directly by consumers of the library.
 *
 * @example
 * ```typescript
 * // Get the current dataset state
 * const {state, subscribe} = getDatasetsState()
 *
 * // Subscribe to state changes
 * const unsubscribe = subscribe(() => {
 *   console.log('Dataset state changed:', state)
 * })
 *
 * // Later, clean up the subscription
 * unsubscribe()
 * ```
 *
 * @returns An object containing:
 * - The current dataset state
 * - A `subscribe` function that accepts a callback to be called on state changes
 *   and returns an unsubscribe function
 */
export const getDatasetsState = createAction(datasetsStore, ({state}) => () => {
  return {
    ...state.get(),
    subscribe: (onStoreChange: () => void) => {
      const subscription = state.observable.subscribe(onStoreChange)

      return () => subscription.unsubscribe()
    },
  }
})
