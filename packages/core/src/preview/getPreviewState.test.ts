import {NEVER} from 'rxjs'
import {describe, it} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StoreState} from '../store/createStoreState'
import {insecureRandomId} from '../utils/ids'
import {getPreviewState} from './getPreviewState'
import {type PreviewStoreState} from './previewStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {STABLE_EMPTY_PREVIEW} from './util'

vi.mock('../utils/ids', async (importOriginal) => {
  const util = await importOriginal<typeof import('../utils/ids')>()
  return {...util, insecureRandomId: vi.fn(util.insecureRandomId)}
})

vi.mock('./subscribeToStateAndFetchBatches.ts')

describe('getPreviewState', () => {
  let instance: SanityInstance
  const docHandle = {documentId: 'exampleId', documentType: 'exampleType'}
  let state: StoreState<PreviewStoreState & {extra?: unknown}>

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

  it('returns a state source that emits when the preview value changes', () => {
    const previewState = getPreviewState(instance, docHandle)
    expect(previewState.getCurrent()).toBe(STABLE_EMPTY_PREVIEW)

    const subscriber = vi.fn()
    previewState.subscribe(subscriber)

    // emit unrelated state changes
    state.set('updateLastLiveEventId', {extra: 'unrelated change'})
    expect(subscriber).toHaveBeenCalledTimes(0)

    state.set('relatedChange', (prev) => ({
      values: {...prev.values, exampleId: {data: {title: 'Changed!'}, isPending: false}},
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)

    state.set('unrelatedChange', (prev) => ({
      values: {
        ...prev.values,
        unrelatedId: {data: {title: 'Unrelated Document'}, isPending: false},
      },
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)

    state.set('relatedChange', (prev) => ({
      values: {...prev.values, exampleId: {data: {title: 'Changed again!'}, isPending: false}},
    }))
    expect(subscriber).toHaveBeenCalledTimes(2)
  })

  it('adds a subscription ID and document type to the state on subscription', () => {
    const previewState = getPreviewState(instance, docHandle)

    expect(state.get().subscriptions).toEqual({})
    vi.mocked(insecureRandomId)
      .mockImplementationOnce(() => 'pseudoRandomId1')
      .mockImplementationOnce(() => 'pseudoRandomId2')

    const unsubscribe1 = previewState.subscribe(vi.fn())
    const unsubscribe2 = previewState.subscribe(vi.fn())

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
    const previewState = getPreviewState(instance, docHandle)

    state.set('presetValueToPending', (prev) => ({
      values: {...prev.values, [docHandle.documentId]: {data: {title: 'Foo'}, isPending: true}},
    }))

    const unsubscribe1 = previewState.subscribe(vi.fn())
    const unsubscribe2 = previewState.subscribe(vi.fn())

    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {title: 'Foo'},
      isPending: true,
    })

    unsubscribe1()
    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {title: 'Foo'},
      isPending: true,
    })

    unsubscribe2()
    expect(state.get().subscriptions).toEqual({})
    expect(state.get().values[docHandle.documentId]).toEqual({
      data: {title: 'Foo'},
      isPending: false,
    })
  })
})
