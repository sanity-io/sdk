import {createAction} from '../../resources/createAction'
import {clientStore} from '../clientStore'

/**
 * Retrieves the global, project-less client.
 * @public
 */
export const getGlobalClient = createAction(
  clientStore,
  ({state}) =>
    () =>
      state.get().defaultGlobalClient,
)
