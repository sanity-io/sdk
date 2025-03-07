import {filter, firstValueFrom} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {PAGE_SIZE} from './documentListConstants'
import {createDocumentListStore, type DocumentListState} from './documentListStore'
import {subscribeToLiveClientAndSetLastLiveEventId} from './subscribeToLiveClientAndSetLastLiveEventId'
import {subscribeToStateAndFetchResults} from './subscribeToStateAndFetchResults'

vi.mock('./subscribeToLiveClientAndSetLastLiveEventId', () => ({
  subscribeToLiveClientAndSetLastLiveEventId: vi.fn().mockReturnValue({
    unsubscribe: vi.fn(),
  }),
}))

vi.mock('./subscribeToStateAndFetchResults', () => ({
  subscribeToStateAndFetchResults: vi.fn().mockReturnValue({
    unsubscribe: vi.fn(),
  }),
}))

describe('documentListStore', () => {
  let state: ResourceState<DocumentListState>
  let instance: ReturnType<typeof createSanityInstance>

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    state = createResourceState<DocumentListState>(
      {
        limit: PAGE_SIZE,
        options: {perspective: 'drafts'},
        results: [],
        syncTags: [],
        isPending: false,
        count: 0,
      },
      {name: 'documentList'},
    )
  })

  describe('store actions', () => {
    it('should expose a getState selector with empty results', async () => {
      const store = createDocumentListStore({state, instance})
      const statePromise = firstValueFrom(store.getState().observable)

      await expect(statePromise).resolves.toEqual({
        results: [],
        isPending: false,
        count: 0,
        hasMore: false,
      })
    })

    it('should expose a getState selector with populated results', async () => {
      const store = createDocumentListStore({instance, state})
      const results = [{_id: 'doc1', _type: 'testType'}]
      state.set('updateFromFetch', {
        results,
        count: 1,
        syncTags: [],
        isPending: false,
      })
      const statePromise = firstValueFrom(
        store.getState().observable.pipe(filter((s) => !!s.results.length)),
      )

      await expect(statePromise).resolves.toEqual({
        results,
        isPending: false,
        count: 1,
        hasMore: false,
      })
    })

    it('should update filter via setOptions action', async () => {
      const store = createDocumentListStore({instance, state})
      store.setOptions({filter: '_type == "testType"'})

      const statePromise = firstValueFrom(
        state.observable.pipe(filter((s) => s.options.filter === '_type == "testType"')),
      )

      await expect(statePromise).resolves.toMatchObject({
        options: {
          perspective: 'drafts',
          filter: '_type == "testType"',
        },
      })
    })

    it('should update sort order via setOptions action', async () => {
      const store = createDocumentListStore({instance, state})
      store.setOptions({sort: [{field: '_createdAt', direction: 'asc'}]})

      const statePromise = firstValueFrom(
        state.observable.pipe(filter((s) => s.options.sort?.[0].field === '_createdAt')),
      )

      await expect(statePromise).resolves.toMatchObject({
        options: {
          perspective: 'drafts',
          sort: [{field: '_createdAt', direction: 'asc'}],
        },
      })
    })

    it('should increase limit via loadMore action', async () => {
      const store = createDocumentListStore({instance, state})
      store.loadMore()

      const statePromise = firstValueFrom(
        state.observable.pipe(filter((s) => s.limit === PAGE_SIZE * 2)),
      )
      await expect(statePromise).resolves.toMatchObject({limit: PAGE_SIZE * 2})
    })

    it('should handle multiple loadMore calls', async () => {
      const store = createDocumentListStore({instance, state})
      store.loadMore()
      store.loadMore()

      const statePromise = firstValueFrom(
        state.observable.pipe(filter((s) => s.limit === PAGE_SIZE * 3)),
      )
      await expect(statePromise).resolves.toMatchObject({limit: 75})
    })

    it('should call initialize and unsubscribe when store is destroyed', () => {
      const liveClientUnsubscribe =
        // @ts-expect-error no parameter required since mocking
        subscribeToLiveClientAndSetLastLiveEventId().unsubscribe

      const stateUnsubscribe =
        // @ts-expect-error no parameter required since mocking
        subscribeToStateAndFetchResults().unsubscribe

      vi.mocked(subscribeToLiveClientAndSetLastLiveEventId).mockClear()
      vi.mocked(subscribeToStateAndFetchResults).mockClear()

      expect(subscribeToLiveClientAndSetLastLiveEventId).not.toHaveBeenCalled()
      expect(subscribeToStateAndFetchResults).not.toHaveBeenCalled()
      expect(liveClientUnsubscribe).not.toHaveBeenCalled()
      expect(stateUnsubscribe).not.toHaveBeenCalled()

      const store = createDocumentListStore(instance)

      expect(subscribeToLiveClientAndSetLastLiveEventId).toHaveBeenCalled()
      expect(subscribeToStateAndFetchResults).toHaveBeenCalled()
      expect(liveClientUnsubscribe).not.toHaveBeenCalled()
      expect(stateUnsubscribe).not.toHaveBeenCalled()

      store.dispose()

      expect(liveClientUnsubscribe).toHaveBeenCalled()
      expect(stateUnsubscribe).toHaveBeenCalled()
    })
  })

  describe('hasMore calculation', () => {
    it('should set hasMore true when there are more results than limit', async () => {
      const store = createDocumentListStore({instance, state})
      state.set('updateFromFetch', {
        results: Array.from({length: PAGE_SIZE}, (_, index) => ({
          _id: `doc${index}`,
          _type: 'test',
        })),
        count: PAGE_SIZE + 1,
        syncTags: [],
        isPending: false,
      })

      const statePromise = firstValueFrom(
        store.getState().observable.pipe(filter((s) => s.results.length === PAGE_SIZE)),
      )

      await expect(statePromise).resolves.toMatchObject({
        hasMore: true,
        count: PAGE_SIZE + 1,
      })
    })

    it('should set hasMore false when all results are loaded', async () => {
      const store = createDocumentListStore({instance, state})
      state.set('updateFromFetch', {
        results: Array.from({length: 5}, (_, index) => ({_id: `doc${index}`, _type: 'test'})),
        count: 5,
        syncTags: [],
        isPending: false,
      })

      const statePromise = firstValueFrom(
        store.getState().observable.pipe(filter((s) => s.results.length === 5)),
      )

      await expect(statePromise).resolves.toMatchObject({
        hasMore: false,
        count: 5,
      })
    })
  })
})
