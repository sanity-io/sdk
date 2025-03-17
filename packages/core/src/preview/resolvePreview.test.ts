import {describe, it, type Mock} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {
  createResourceState,
  getOrCreateResource,
  type InitializedResource,
  type ResourceState,
} from '../resources/createResource'
import {insecureRandomId} from '../utils/ids'
import {
  previewStore,
  type PreviewStoreState,
  type PreviewValue,
  type ValuePending,
} from './previewStore'
import {resolvePreview} from './resolvePreview'

vi.mock('../utils/ids', async (importOriginal) => {
  const util = await importOriginal<typeof import('../utils/ids')>()
  return {...util, insecureRandomId: vi.fn(util.insecureRandomId)}
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
    ;(insecureRandomId as Mock).mockImplementationOnce(() => 'pseudoRandomId')

    const previewPromise = resolvePreview({state, instance}, {document})
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateDifferentDocument', (prev) => ({
      values: {
        ...prev.values,
        differentId: {data: {title: 'Different Document'}, isPending: false},
      },
    }))

    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateCorrectDocumentButNull', (prev) => ({
      values: {...prev.values, exampleId: {data: null, isPending: true}},
    }))

    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateCorrectDocument', (prev) => ({
      values: {...prev.values, exampleId: {data: {title: 'Correct Document'}, isPending: false}},
    }))

    const preview = await previewPromise
    expect(preview).toEqual({data: {title: 'Correct Document'}, isPending: false})

    // subscription is removed after
    expect(state.get().subscriptions).toEqual({})
  })

  it('resolves with the next emitted state (not current state)', async () => {
    const currentValue: ValuePending<PreviewValue> = {
      data: {title: 'Correct Document'},
      isPending: false,
    }
    state.set('setInitialDocument', (prev) => ({
      values: {...prev.values, exampleId: currentValue},
    }))
    vi.mocked(insecureRandomId).mockImplementationOnce(() => 'pseudoRandomId')
    expect(state.get().subscriptions).toEqual({})

    const previewPromise = resolvePreview({state, instance}, {document})
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateDifferentDocument', (prev) => ({
      values: {
        ...prev.values,
        differentId: {data: {title: 'Different Document'}, isPending: false},
      },
    }))
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateWithCurrentValue', (prev) => ({
      values: {...prev.values, exampleId: currentValue},
    }))
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateWithNewValue', (prev) => ({
      values: {...prev.values, exampleId: {data: {title: 'New Value'}, isPending: false}},
    }))
    expect(state.get().subscriptions).toEqual({})

    const preview = await previewPromise
    expect(preview).toEqual({data: {title: 'New Value'}, isPending: false})
  })

  it('calls getOrCreateResource if no state is provided', () => {
    vi.mocked(getOrCreateResource).mockReturnValue({state} as InitializedResource<unknown>)
    resolvePreview(instance, {document})
    expect(getOrCreateResource).toHaveBeenCalledWith(instance, previewStore)
  })
})
