import {NEVER} from 'rxjs'
import {describe, it} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StoreState} from '../store/createStoreState'
import {insecureRandomId} from '../utils/ids'
import {getProjectionState} from './getProjectionState'
import {type ProjectionStoreState} from './projectionStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {PROJECTION_STATE_CLEAR_DELAY, STABLE_EMPTY_PROJECTION} from './util'

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
    vi.useFakeTimers() // Enable fake timers for each test
  })

  afterEach(() => {
    instance.dispose()
    vi.useRealTimers() // Restore real timers after each test
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
    vi.mocked(insecureRandomId).mockImplementationOnce(() => 'pseudoRandomId1')

    const unsubscribe1 = projectionState.subscribe(vi.fn())

    expect(state.get().subscriptions).toEqual({
      exampleId: {pseudoRandomId1: true},
    })
    expect(state.get().documentProjections).toEqual({
      exampleId: projection,
    })

    // Unsubscribe the last one - state should NOT clear immediately
    unsubscribe1()
    expect(state.get().subscriptions).toEqual({
      exampleId: {pseudoRandomId1: true},
    })
    // Projection data might also remain initially
    expect(state.get().documentProjections).toEqual({
      exampleId: projection,
    })

    // Advance timers past the clear delay
    vi.advanceTimersByTime(PROJECTION_STATE_CLEAR_DELAY)

    // NOW the state related to this document should be cleared
    expect(state.get().subscriptions).toEqual({})
    expect(state.get().documentProjections).toEqual({exampleId: projection})
  })

  it('resets to pending false on unsubscribe if the subscription is the last one', () => {
    const projectionState = getProjectionState(instance, {projection, ...docHandle})

    state.set('presetValueToPending', (prev) => ({
      values: {...prev.values, [docHandle.documentId]: {data: {field: 'Foo'}, isPending: true}},
    }))

    const unsubscribe1 = projectionState.subscribe(vi.fn())

    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {field: 'Foo'},
      isPending: true,
    })

    // Unsubscribe one - pending state remains
    unsubscribe1()
    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {field: 'Foo'},
      isPending: true,
    })

    // Unsubscribe the last one - pending state should NOT reset immediately
    expect(Object.keys(state.get().subscriptions['exampleId'] || {}).length).toBeGreaterThan(0)
    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {field: 'Foo'},
      isPending: true, // Still pending
    })

    // Advance timers past the clear delay
    vi.advanceTimersByTime(PROJECTION_STATE_CLEAR_DELAY)

    // NOW the pending state should be reset
    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {field: 'Foo'},
      isPending: false, // Reset to false
    })
    // And subscriptions should be cleared now
    expect(state.get().subscriptions).toEqual({})
  })
})
