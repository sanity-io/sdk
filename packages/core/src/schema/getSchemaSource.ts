import {createAction} from '../resources/createAction'
import {createStateSourceAction} from '../resources/createStateSourceAction'
import {schemaManager} from './schemaManager'

const getSchema = createAction(
  () => schemaManager,
  ({state}) => {
    return function () {
      return state.get().schema
    }
  },
)

export const getSchemaSource = createStateSourceAction(() => schemaManager, getSchema)
