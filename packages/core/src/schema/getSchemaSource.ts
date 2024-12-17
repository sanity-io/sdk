import {createAction} from '../resources/createAction'
import {createStateSource} from '../resources/createStateSource'
import {schemaManager} from './schemaManager'

export const getSchemaSource = createAction(
  () => schemaManager,
  ({state}) => {
    return function () {
      return createStateSource(state, () => state.get().schema)
    }
  },
)
