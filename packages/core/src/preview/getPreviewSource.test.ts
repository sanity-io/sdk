import {describe, it, type Mock} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {
  createResourceState,
  getOrCreateResource,
  type ResourceState,
} from '../resources/createResource'
import {getPreviewSource} from './getPreviewSource'
import {previewStore, type PreviewStoreState} from './previewStore'
import {randomId, STABLE_EMPTY_PREVIEW} from './util'

vi.mock('./util', async (importOriginal) => {
  const util = await importOriginal<typeof import('./util')>()
  return {...util, randomId: vi.fn(util.randomId)}
})

vi.mock('../resources/createResource', async (importOriginal) => {
  const original = await importOriginal<typeof import('../resources/createResource')>()
  return {...original, getOrCreateResource: vi.fn()}
})

describe('getPreviewSource', () => {
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

  it('returns a state source that emits when the preview value changes', () => {
    const previewSource = getPreviewSource({state, instance}, {document})
    expect(previewSource.getCurrent()).toBe(STABLE_EMPTY_PREVIEW)

    const subscriber = vi.fn()
    previewSource.subscribe(subscriber)

    // emit unrelated state changes
    state.set('updateLastLiveEventId', {lastLiveEventId: 'newLastLiveEventId'})
    expect(subscriber).toHaveBeenCalledTimes(0)

    state.set('relatedChange', (prev) => ({
      values: {...prev.values, exampleId: [{title: 'Changed!'}, false]},
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)

    state.set('unrelatedChange', (prev) => ({
      values: {...prev.values, unrelatedId: [{title: 'Unrelated Document'}, false]},
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)

    state.set('relatedChange', (prev) => ({
      values: {...prev.values, exampleId: [{title: 'Changed again!'}, false]},
    }))
    expect(subscriber).toHaveBeenCalledTimes(2)
  })

  it('adds a subscription ID and document type to the state on subscription', () => {
    const previewSource = getPreviewSource({state, instance}, {document})

    expect(state.get().subscriptions).toEqual({})
    ;(randomId as Mock)
      .mockImplementationOnce(() => 'pseudoRandomId1')
      .mockImplementationOnce(() => 'pseudoRandomId2')

    const unsubscribe1 = previewSource.subscribe(vi.fn())
    const unsubscribe2 = previewSource.subscribe(vi.fn())

    expect(state.get().subscriptions).toEqual({
      exampleId: {pseudoRandomId1: true, pseudoRandomId2: true},
    })

    unsubscribe2()
    expect(state.get().subscriptions).toEqual({
      exampleId: {pseudoRandomId1: true},
    })

    unsubscribe1()
    expect(state.get().subscriptions).toEqual({})
  })

  it('resets to pending false on unsubscribe if the subscription is the last one', () => {
    state.set('presetValueToPending', (prev) => ({
      values: {...prev.values, [document._id]: [{title: 'Foo'}, true]},
    }))

    const previewSource = getPreviewSource({state, instance}, {document})

    const unsubscribe1 = previewSource.subscribe(vi.fn())
    const unsubscribe2 = previewSource.subscribe(vi.fn())

    expect(state.get().values[document._id]).toEqual([{title: 'Foo'}, true])

    unsubscribe1()
    expect(state.get().values[document._id]).toEqual([{title: 'Foo'}, true])

    unsubscribe2()
    expect(state.get().subscriptions).toEqual({})
    expect(state.get().values[document._id]).toEqual([{title: 'Foo'}, false])
  })

  it('calls getOrCreateResource if no state is provided', () => {
    ;(getOrCreateResource as Mock).mockReturnValue({state})
    getPreviewSource(instance, {document})
    expect(getOrCreateResource).toHaveBeenCalledWith(instance, previewStore)
  })
})
