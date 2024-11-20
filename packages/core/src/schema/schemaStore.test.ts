import {describe, expect, it} from 'vitest'

import {createSchemaStore} from './schemaStore'

describe('schemaStore', () => {
  it('should create a store with initial schema types', () => {
    const mockTypes = [{name: 'post', type: 'document'}]
    const store = createSchemaStore(mockTypes)

    expect(store.getState().schema).toEqual({types: mockTypes})
  })

  it('should update schema when setSchema is called', () => {
    const store = createSchemaStore([])
    const newSchema = {types: [{name: 'author', type: 'document'}]}

    store.getState().setSchema(newSchema)

    expect(store.getState().schema).toEqual(newSchema)
  })

  it('should maintain store reference when updating schema', () => {
    const store = createSchemaStore([])
    const initialStoreRef = store

    store.getState().setSchema({types: []})

    expect(store).toBe(initialStoreRef)
  })
})
