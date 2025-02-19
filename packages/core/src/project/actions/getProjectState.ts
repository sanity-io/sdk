import {createAction} from '../../resources/createAction'
import {projectStore} from '../projectStore'

/** @internal */
export const getProjectState = createAction(projectStore, ({state}) => () => {
  return {
    ...state.get(),
    subscribe: (onStoreChange: () => void) => {
      const subscription = state.observable.subscribe(onStoreChange)
      return () => subscription.unsubscribe()
    },
  }
})
