import {describe, expect, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import type {ResourceState} from '../resources/createResource'
import {getPreview} from './getPreview'
import type {PreviewStoreState, PreviewValue, ValuePending} from './previewStore'
import {STABLE_EMPTY_PREVIEW} from './util'

describe('getPreview', () => {
  const instance = createSanityInstance({projectId: 'exampleProject', dataset: 'exampleDataset'})

  it('should return the stable empty preview if no value is found', () => {
    const state = {
      get: () => ({values: {}}),
    } as ResourceState<PreviewStoreState>
    const document = {_id: 'doc1', _type: 'testType'}
    const action = getPreview({state, instance}, {document})

    expect(action).toEqual(STABLE_EMPTY_PREVIEW)
  })

  it('should return the stored preview value if present', () => {
    const storedValue: ValuePending<PreviewValue> = [{title: 'My Title'}, false]
    const state = {
      get: () => ({
        values: {doc1: storedValue},
      }),
    } as unknown as ResourceState<PreviewStoreState>
    const document = {_id: 'doc1', _type: 'testType'}
    const action = getPreview({state, instance}, {document})
    expect(action).toEqual(storedValue)
  })
})
