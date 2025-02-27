import {describe, it, type Mock} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {
  createResourceState,
  getOrCreateResource,
  type ResourceState,
} from '../resources/createResource'
import {insecureRandomId} from '../utils/ids'
import {getProjectionState} from './getProjectionState'
import {projectionStore, type ProjectionStoreState} from './projectionStore'
import {STABLE_EMPTY_PROJECTION} from './util'

vi.mock('../utils/ids', async (importOriginal) => {
  const util = await importOriginal<typeof import('../utils/ids')>()
  return {...util, insecureRandomId: vi.fn(util.insecureRandomId)}
})

vi.mock('../resources/createResource', async (importOriginal) => {
  const original = await importOriginal<typeof import('../resources/createResource')>()
  return {...original, getOrCreateResource: vi.fn()}
})

describe('getProjectionState', () => {
  const instance = createSanityInstance({projectId: 'exampleProject', dataset: 'exampleDataset'})
  const document = {_id: 'exampleId', _type: 'exampleType'}
  const projection = 'exampleProjection'
  const initialState: ProjectionStoreState = {
    values: {},
    documentProjections: {},
    subscriptions: {},
    syncTags: {},
    lastLiveEventId: null,
  }
  let state: ResourceState<ProjectionStoreState>

  beforeEach(() => {
    state = createResourceState(initialState)
  })

  it('returns a state source that emits when the projection value changes', () => {
    const projectionState = getProjectionState({state, instance}, {document, projection})
    expect(projectionState.getCurrent()).toBe(STABLE_EMPTY_PROJECTION)

    const subscriber = vi.fn()
    projectionState.subscribe(subscriber)

    // emit unrelated state changes
    state.set('updateLastLiveEventId', {lastLiveEventId: 'newLastLiveEventId'})
    expect(subscriber).toHaveBeenCalledTimes(0)

    state.set('relatedChange', (prev) => ({
      values: {...prev.values, exampleId: {results: {field: 'Changed!'}, isPending: false}},
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)

    state.set('unrelatedChange', (prev) => ({
      values: {
        ...prev.values,
        unrelatedId: {results: {field: 'Unrelated Document'}, isPending: false},
      },
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)

    state.set('relatedChange', (prev) => ({
      values: {...prev.values, exampleId: {results: {field: 'Changed again!'}, isPending: false}},
    }))
    expect(subscriber).toHaveBeenCalledTimes(2)
  })

  it('adds a subscription ID and projection to the state on subscription', () => {
    const projectionState = getProjectionState({state, instance}, {document, projection})

    expect(state.get().subscriptions).toEqual({})
    vi.mocked(insecureRandomId)
      .mockImplementationOnce(() => 'pseudoRandomId1')
      .mockImplementationOnce(() => 'pseudoRandomId2')

    const unsubscribe1 = projectionState.subscribe(vi.fn())
    const unsubscribe2 = projectionState.subscribe(vi.fn())

    expect(state.get().subscriptions).toEqual({
      exampleId: {pseudoRandomId1: true, pseudoRandomId2: true},
    })
    expect(state.get().documentProjections).toEqual({
      exampleId: projection,
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
      values: {...prev.values, [document._id]: {results: {field: 'Foo'}, isPending: true}},
    }))

    const projectionState = getProjectionState({state, instance}, {document, projection})

    const unsubscribe1 = projectionState.subscribe(vi.fn())
    const unsubscribe2 = projectionState.subscribe(vi.fn())

    expect(state.get().values[document._id]).toEqual({results: {field: 'Foo'}, isPending: true})

    unsubscribe1()
    expect(state.get().values[document._id]).toEqual({results: {field: 'Foo'}, isPending: true})

    unsubscribe2()
    expect(state.get().subscriptions).toEqual({})
    expect(state.get().values[document._id]).toEqual({results: {field: 'Foo'}, isPending: false})
  })

  it('calls getOrCreateResource if no state is provided', () => {
    ;(getOrCreateResource as Mock).mockReturnValue({state})
    getProjectionState(instance, {document, projection})
    expect(getOrCreateResource).toHaveBeenCalledWith(instance, projectionStore)
  })
})
