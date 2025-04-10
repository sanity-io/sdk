import {NEVER} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StoreState} from '../store/createStoreState'
import {hashString} from '../utils/hashString'
import {insecureRandomId} from '../utils/ids'
import {getProjectionState} from './getProjectionState'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {type ProjectionStoreState} from './types'
import {PROJECTION_STATE_CLEAR_DELAY, STABLE_EMPTY_PROJECTION} from './util'
// mocking subscription counts is a little tricky.
// all test ids in this file start at 2 because the first call to onSubscribe
// happens within createStateSourceAction
let mockIdCounter = 0

vi.mock('../utils/ids', async (importOriginal) => {
  const util = await importOriginal<typeof import('../utils/ids')>()
  // Mock implementation uses the external counter
  return {
    ...util,
    insecureRandomId: vi.fn(() => {
      const id = `testSubId_${++mockIdCounter}`
      return id
    }),
  }
})

vi.mock('./subscribeToStateAndFetchBatches.ts')

describe('getProjectionState', () => {
  let instance: SanityInstance
  const docHandle = {documentId: 'exampleId', documentType: 'exampleType'}
  const projection1 = '{exampleProjection1}'
  const hash1 = hashString(projection1)
  const projection2 = '{exampleProjection2}'
  const hash2 = hashString(projection2)

  let state: StoreState<ProjectionStoreState & {extra?: unknown}>

  beforeEach(() => {
    mockIdCounter = 0
    vi.mocked(insecureRandomId).mockClear()

    // Capture state
    vi.mocked(subscribeToStateAndFetchBatches).mockImplementation((context) => {
      state = context.state
      return NEVER.subscribe()
    })

    instance = createSanityInstance({projectId: 'exampleProject', dataset: 'exampleDataset'})
    vi.useFakeTimers() // Enable fake timers for each test
  })

  afterEach(() => {
    instance.dispose()
    vi.useRealTimers() // Restore real timers
  })

  it('returns a state source that emits when the specific projection value changes', () => {
    const projectionState = getProjectionState(instance, {projection: projection1, ...docHandle})
    expect(projectionState.getCurrent()).toEqual(STABLE_EMPTY_PROJECTION)

    const subscriber = vi.fn()
    const unsubscribe = projectionState.subscribe(subscriber)

    // 1. Update the specific projection
    state.set('update_doc1_proj1', (prev: ProjectionStoreState) => ({
      values: {
        ...prev.values,
        [docHandle.documentId]: {
          ...prev.values[docHandle.documentId],
          [hash1]: {data: {name: 'Update 1'}, isPending: false},
        },
      },
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)
    expect(projectionState.getCurrent()).toEqual({data: {name: 'Update 1'}, isPending: false})

    // 2. Update a different projection for the same document
    state.set('update_doc1_proj2', (prev: ProjectionStoreState) => ({
      values: {
        ...prev.values,
        [docHandle.documentId]: {
          ...prev.values[docHandle.documentId],
          [hash2]: {data: {_type: 'type1'}, isPending: false},
        },
      },
    }))
    // Should NOT trigger the subscriber for projection1
    expect(subscriber).toHaveBeenCalledTimes(1)
    expect(projectionState.getCurrent()).toEqual({data: {name: 'Update 1'}, isPending: false})

    // 3. Update a different document
    state.set('update_doc2', (prev: ProjectionStoreState) => ({
      values: {
        ...prev.values,
        doc2: {
          [hash1]: {data: {name: 'Other Doc'}, isPending: false},
        },
      },
    }))
    // Should NOT trigger the subscriber for doc1/projection1
    expect(subscriber).toHaveBeenCalledTimes(1)

    // 4. Update the specific projection again
    state.set('update_doc1_proj1_again', (prev: ProjectionStoreState) => ({
      values: {
        ...prev.values,
        [docHandle.documentId]: {
          ...prev.values[docHandle.documentId],
          [hash1]: {data: {name: 'Update 2'}, isPending: false},
        },
      },
    }))
    expect(subscriber).toHaveBeenCalledTimes(2)
    expect(projectionState.getCurrent()).toEqual({data: {name: 'Update 2'}, isPending: false})

    unsubscribe()
  })

  it('adds a subscription ID and projection to the correct hash on subscription and cleans up', () => {
    const projectionState1 = getProjectionState(instance, {projection: projection1, ...docHandle})
    const projectionState2 = getProjectionState(instance, {projection: projection2, ...docHandle})

    expect(state.get().subscriptions).toEqual({})
    expect(state.get().documentProjections).toEqual({})

    const unsubscribe1 = projectionState1.subscribe(vi.fn()) // Should use ID 3
    expect(state.get().subscriptions).toEqual({
      [docHandle.documentId]: {[hash1]: {testSubId_2: true}},
    })
    expect(state.get().documentProjections).toEqual({
      [docHandle.documentId]: {[hash1]: projection1},
    })

    const unsubscribe2 = projectionState2.subscribe(vi.fn()) // Should use ID 4
    expect(state.get().subscriptions).toEqual({
      [docHandle.documentId]: {
        [hash1]: {testSubId_2: true},
        [hash2]: {testSubId_3: true},
      },
    })
    expect(state.get().documentProjections).toEqual({
      [docHandle.documentId]: {
        [hash1]: projection1,
        [hash2]: projection2,
      },
    })

    const unsubscribe3 = projectionState1.subscribe(vi.fn()) // Should use ID 5
    expect(state.get().subscriptions).toEqual({
      [docHandle.documentId]: {
        [hash1]: {testSubId_2: true, testSubId_4: true},
        [hash2]: {testSubId_3: true},
      },
    })

    // projections state should remain the same, even with multiple subscribers
    expect(state.get().documentProjections).toEqual({
      [docHandle.documentId]: {
        [hash1]: projection1,
        [hash2]: projection2,
      },
    })

    // --- Test Unsubscribe ---
    unsubscribe1() // Unsubscribes ID 3
    expect(state.get().subscriptions[docHandle.documentId]?.[hash1]).toEqual({
      testSubId_2: true,
      testSubId_4: true,
    })
    vi.advanceTimersByTime(PROJECTION_STATE_CLEAR_DELAY)
    expect(state.get().subscriptions[docHandle.documentId]?.[hash1]).toEqual({testSubId_4: true})
    expect(state.get().documentProjections[docHandle.documentId]?.[hash1]).toEqual(projection1)

    unsubscribe3() // Unsubscribes ID 5
    vi.advanceTimersByTime(PROJECTION_STATE_CLEAR_DELAY)
    expect(state.get().subscriptions[docHandle.documentId]?.[hash1]).toBeUndefined()
    expect(state.get().documentProjections[docHandle.documentId]?.[hash1]).toBeUndefined()
    expect(state.get().subscriptions[docHandle.documentId]?.[hash2]).toEqual({testSubId_3: true})
    expect(state.get().documentProjections[docHandle.documentId]?.[hash2]).toEqual(projection2)

    unsubscribe2() // Unsubscribes ID 4
    vi.advanceTimersByTime(PROJECTION_STATE_CLEAR_DELAY)
    expect(state.get().subscriptions[docHandle.documentId]).toBeUndefined()
    expect(state.get().documentProjections[docHandle.documentId]).toBeUndefined()
  })

  it('resets isPending to false for the specific projection on final unsubscribe for that projection', () => {
    const projectionState = getProjectionState(instance, {projection: projection1, ...docHandle})
    const initialData = {name: 'Initial Name'}
    const hash = hashString(projection1)

    state.set('presetValueToPending', (prev: ProjectionStoreState) => ({
      values: {
        ...prev.values,
        [docHandle.documentId]: {
          ...prev.values[docHandle.documentId],
          [hash]: {data: initialData, isPending: true},
        },
      },
    }))

    const unsubscribe1 = projectionState.subscribe(vi.fn()) // Should use ID 2
    const unsubscribe2 = projectionState.subscribe(vi.fn()) // Should use ID 3

    expect(state.get().values[docHandle.documentId]?.[hash]).toEqual({
      data: initialData,
      isPending: true,
    })

    unsubscribe1() // Unsubscribes ID 2
    vi.advanceTimersByTime(PROJECTION_STATE_CLEAR_DELAY)
    expect(state.get().values[docHandle.documentId]?.[hash]).toEqual({
      data: initialData,
      isPending: true,
    })
    expect(Object.keys(state.get().subscriptions[docHandle.documentId]?.[hash] ?? {}).length).toBe(
      1,
    )
    expect(state.get().subscriptions[docHandle.documentId]?.[hash]).toEqual({testSubId_3: true})

    unsubscribe2() // Unsubscribes ID 3
    expect(state.get().values[docHandle.documentId]?.[hash]).toEqual({
      data: initialData,
      isPending: true,
    })
    vi.advanceTimersByTime(PROJECTION_STATE_CLEAR_DELAY)

    // NOW the pending state should be reset for this specific projection
    expect(state.get().values[docHandle.documentId]?.[hash]).toEqual({
      data: initialData,
      isPending: false,
    })
    expect(state.get().subscriptions[docHandle.documentId]?.[hash]).toBeUndefined()
    expect(state.get().documentProjections[docHandle.documentId]?.[hash]).toBeUndefined()
  })
})
