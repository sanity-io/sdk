import {describe, it, type Mock} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {
  createResourceState,
  getOrCreateResource,
  type ResourceState,
} from '../resources/createResource'
import {
  previewStore,
  type PreviewStoreState,
  type PreviewValue,
  type ValuePending,
} from './previewStore'
import {resolvePreview} from './resolvePreview'
import {randomId} from './util'

vi.mock('./util', async (importOriginal) => {
  const util = await importOriginal<typeof import('./util')>()
  return {...util, randomId: vi.fn(util.randomId)}
})

vi.mock('../resources/createResource', async (importOriginal) => {
  const original = await importOriginal<typeof import('../resources/createResource')>()
  return {...original, getOrCreateResource: vi.fn()}
})

describe('resolvePreview', () => {
  const instance = createSanityInstance({projectId: 'exampleProject', dataset: 'exampleDataset'})
  const document = {_id: 'exampleId', _type: 'exampleType'}
  const initialState: PreviewStoreState = {
    documentTypes: {},
    lastLiveEventId: null,
    subscriptions: {},
    syncTags: {},
    values: {},
  }
  let state: ResourceState<PreviewStoreState>

  beforeEach(() => {
    state = createResourceState(initialState)
  })

  it('subscribes and resolves when the preview value is non-null', async () => {
    expect(state.get().subscriptions).toEqual({})
    ;(randomId as Mock).mockImplementationOnce(() => 'pseudoRandomId')

    const previewPromise = resolvePreview({state, instance}, {document})
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateDifferentDocument', (prev) => ({
      values: {...prev.values, differentId: [{title: 'Different Document'}, false]},
    }))

    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateCorrectDocumentButNull', (prev) => ({
      values: {...prev.values, exampleId: [null, true]},
    }))

    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateCorrectDocument', (prev) => ({
      values: {...prev.values, exampleId: [{title: 'Correct Document'}, false]},
    }))

    const preview = await previewPromise
    expect(preview).toEqual([{title: 'Correct Document'}, false])

    // subscription is removed after
    expect(state.get().subscriptions).toEqual({})
  })

  it('resolves with the next emitted state (not current state)', async () => {
    const currentValue: ValuePending<PreviewValue> = [{title: 'Correct Document'}, false]
    state.set('setInitialDocument', (prev) => ({
      values: {...prev.values, exampleId: currentValue},
    }))
    ;(randomId as Mock).mockImplementationOnce(() => 'pseudoRandomId')
    expect(state.get().subscriptions).toEqual({})

    const previewPromise = resolvePreview({state, instance}, {document})
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateDifferentDocument', (prev) => ({
      values: {...prev.values, differentId: [{title: 'Different Document'}, false]},
    }))
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateWithCurrentValue', (prev) => ({
      values: {...prev.values, exampleId: currentValue},
    }))
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateWithNewValue', (prev) => ({
      values: {...prev.values, exampleId: [{title: 'New Value'}, false]},
    }))
    expect(state.get().subscriptions).toEqual({})

    const preview = await previewPromise
    expect(preview).toEqual([{title: 'New Value'}, false])
  })

  it('calls getOrCreateResource if no state is provided', () => {
    ;(getOrCreateResource as Mock).mockReturnValue({state})
    resolvePreview(instance, {document})
    expect(getOrCreateResource).toHaveBeenCalledWith(instance, previewStore)
  })
})
