import {createAction} from '../../resources/createAction'
import {userStore} from '../userStore'

/**
 * Returns the current user state and provides a subscription mechanism for state changes.
 *
 * @remarks
 * This action is marked as internal and should not be used directly by consumers of the library.
 *
 * @example
 * ```typescript
 * // Get the current user state
 * const {state, subscribe} = getUserState()
 *
 * // Subscribe to state changes
 * const unsubscribe = subscribe(() => {
 *   console.log('User state changed:', state)
 * })
 *
 * // Later, clean up the subscription
 * unsubscribe()
 * ```
 *
 * @returns An object containing:
 * - The current user state
 * - A `subscribe` function that accepts a callback to be called on state changes
 *   and returns an unsubscribe function
 *
 * @internal
 */
export const getUserState = createAction(userStore, ({state}) => () => {
  return {
    ...state.get(),
    subscribe: (onStoreChange: () => void) => {
      const subscription = state.observable.subscribe(onStoreChange)
      return () => subscription.unsubscribe()
    },
  }
})
