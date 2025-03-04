import {describe, expect, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {schemaManager} from './schemaManager'

describe('previewStore', () => {
  it('is a resource that initializes with state and subscriptions', () => {
    const types = [{name: 'person', type: 'document', fields: [{name: 'name', type: 'string'}]}]
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
      schema: {types},
    })
    const {schema} = schemaManager.getInitialState(instance)

    const schemaType = schema.get('person')

    expect(schemaType).toMatchObject({
      name: 'person',
      fields: [{name: 'name'}],
    })
  })
})
