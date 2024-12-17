import {type Schema} from '@sanity/types'
import {describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {getSchemaSource} from './getSchemaSource'

describe('getSchemaSource', () => {
  const instance = createSanityInstance({projectId: 'test', dataset: 'test'})

  it('should return a state source that emits the schema', () => {
    const mockSchema = {name: 'testSchema', types: []} as unknown as Schema
    const state = createResourceState({schema: mockSchema})

    const source = getSchemaSource({state, instance})
    expect(source.getCurrent()).toEqual(mockSchema)

    const next = vi.fn()
    source.subscribe(next)

    const mockSchema2 = {name: 'testSchema2', types: []} as unknown as Schema
    state.set('updateSchema', {schema: mockSchema2})
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenLastCalledWith(mockSchema2)
  })

  it('should return the schema from the state', () => {
    const mockSchema = {name: 'testSchema', types: []} as unknown as Schema
    const state = createResourceState({schema: mockSchema})
    const source = getSchemaSource({state, instance})

    expect(source.getCurrent()).toEqual(mockSchema)
  })
})
