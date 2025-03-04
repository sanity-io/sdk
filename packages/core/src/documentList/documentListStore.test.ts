import {describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createDocumentListStore, type DatasetResourceId} from './documentListStore'

describe('documentListStore', () => {
  const datasetResourceId: DatasetResourceId = 'p:d'

  it('should create a document list store with initial state', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
    })
    const store = createDocumentListStore(instance, datasetResourceId)
    const state = store.getState().getCurrent()

    expect(state.results).toEqual([])
    expect(state.isPending).toBe(false)
    expect(state.count).toBe(0)
    expect(state.hasMore).toBe(false)
  })

  it('should load more documents', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
    })
    const store = createDocumentListStore(instance, datasetResourceId as DatasetResourceId)
    store.loadMore()

    const state = store.getState().getCurrent()
    expect(state.hasMore).toBe(false)
  })

  it('should unsubscribe on dispose', () => {
    const instance = createSanityInstance({
      resources: [{projectId: 'p', dataset: 'd'}],
    })
    const store = createDocumentListStore(instance, datasetResourceId)
    const unsubscribeSpy = vi.fn()

    // Mock the unsubscribe functions
    vi.spyOn(store, 'dispose').mockImplementation(unsubscribeSpy)

    store.dispose()
    expect(unsubscribeSpy).toHaveBeenCalled()
  })
})
