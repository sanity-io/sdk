import {createAction} from '../../resources/createAction'
import {projectStore} from '../projectStore'

/**
 * Returns the current project state and provides a subscription mechanism for state changes.
 *
 * @remarks
 * This action is marked as internal and should not be used directly by consumers of the library.
 *
 * @example
 * ```typescript
 * // Get the current project state
 * const {state, subscribe} = getProjectState()
 *
 * // Subscribe to state changes
 * const unsubscribe = subscribe(() => {
 *   console.log('Project state changed:', state)
 * })
 *
 * // Later, clean up the subscription
 * unsubscribe()
 * ```
 *
 * @returns An object containing:
 * - The current project state
 * - A `subscribe` function that accepts a callback to be called on state changes
 *   and returns an unsubscribe function
 *
 * @internal
 */
export const getProjectState = createAction(projectStore, ({state}) => () => {
  return {
    ...state.get(),
    subscribe: (onStoreChange: () => void) => {
      const subscription = state.observable.subscribe(onStoreChange)
      return () => subscription.unsubscribe()
    },
  }
})
