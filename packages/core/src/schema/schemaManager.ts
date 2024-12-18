import {Schema as SchemaConstructor} from '@sanity/schema'
import {type Schema, type SchemaTypeDefinition} from '@sanity/types'

import {createResource} from '../resources/createResource'

/**
 * @public
 */
export interface SchemaConfig {
  types: SchemaTypeDefinition[]
}

/**
 * @public
 */
export interface SchemaManagerState {
  schema: Schema
}

export const schemaManager = createResource<SchemaManagerState>({
  name: 'schemaManager',
  getInitialState(instance) {
    const {config} = instance
    const schema = SchemaConstructor.compile({
      name: 'default',
      types: config.schema?.types ?? [],
    })

    // TODO: check for schema errors and warn on schema warnings

    return {schema}
  },
})
