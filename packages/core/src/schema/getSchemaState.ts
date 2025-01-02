import {createStateSourceAction} from '../resources/createStateSourceAction'
import {schemaManager} from './schemaManager'

export const getSchemaState = createStateSourceAction(
  () => schemaManager,
  (state) => state.schema,
)
