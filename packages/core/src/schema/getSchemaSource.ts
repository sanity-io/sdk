import {createStateSourceAction} from '../resources/createStateSourceAction'
import {schemaManager} from './schemaManager'

export const getSchemaSource = createStateSourceAction(
  () => schemaManager,
  (state) => state.schema,
)
