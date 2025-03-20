import {NEVER} from 'rxjs'
import {describe, it} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StoreState} from '../store/createStoreState'
import {insecureRandomId} from '../utils/ids'
import {getProjectionState} from './getProjectionState'
import {type ProjectionStoreState} from './projectionStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {STABLE_EMPTY_PROJECTION} from './util'

vi.mock('../utils/ids', async (importOriginal) => {
  const util = await importOriginal<typeof import('../utils/ids')>()
  return {...util, insecureRandomId: vi.fn(util.insecureRandomId)}
})

vi.mock('./subscribeToStateAndFetchBatches.ts')

describe('getProjectionState', () => {
  let instance: SanityInstance
  const docHandle = {documentId: 'exampleId', documentType: 'exampleType'}
  const projection = '{exampleProjection}'
  let state: StoreState<ProjectionStoreState & {extra?: unknown}>

  beforeEach(() => {
    // capture state
    vi.mocked(subscribeToStateAndFetchBatches).mockImplementation((context) => {
      state = context.state
      return NEVER.subscribe()
    })

    instance = createSanityInstance({projectId: 'exampleProject', dataset: 'exampleDataset'})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('returns a state source that emits when the projection value changes', () => {
    const projectionState = getProjectionState(instance, {projection, ...docHandle})
    expect(projectionState.getCurrent()).toBe(STABLE_EMPTY_PROJECTION)

    const subscriber = vi.fn()
    projectionState.subscribe(subscriber)

    // emit unrelated state changes
    state.set('updateLastLiveEventId', {extra: 'unrelated change'})
    expect(subscriber).toHaveBeenCalledTimes(0)

    state.set('relatedChange', (prev) => ({
      values: {...prev.values, exampleId: {data: {field: 'Changed!'}, isPending: false}},
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)

    state.set('unrelatedChange', (prev) => ({
      values: {
        ...prev.values,
        unrelatedId: {data: {field: 'Unrelated Document'}, isPending: false},
      },
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)

    state.set('relatedChange', (prev) => ({
      values: {...prev.values, exampleId: {data: {field: 'Changed again!'}, isPending: false}},
    }))
    expect(subscriber).toHaveBeenCalledTimes(2)
  })

  it('adds a subscription ID and projection to the state on subscription', () => {
    const projectionState = getProjectionState(instance, {projection, ...docHandle})

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
    const projectionState = getProjectionState(instance, {projection, ...docHandle})

    state.set('presetValueToPending', (prev) => ({
      values: {...prev.values, [docHandle.documentId]: {data: {field: 'Foo'}, isPending: true}},
    }))

    const unsubscribe1 = projectionState.subscribe(vi.fn())
    const unsubscribe2 = projectionState.subscribe(vi.fn())

    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {field: 'Foo'},
      isPending: true,
    })

    unsubscribe1()
    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {field: 'Foo'},
      isPending: true,
    })

    unsubscribe2()
    expect(state.get().subscriptions).toEqual({})
    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {field: 'Foo'},
      isPending: false,
    })
  })
})
