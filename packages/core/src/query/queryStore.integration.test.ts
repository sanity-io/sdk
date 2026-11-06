import {type ListenEvent, type ReleaseDocument, type SanityClient} from '@sanity/client'
import {of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {type DocumentResource, isDatasetResource} from '../config/sanityConfig'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {getQueryState, resolveQuery} from './queryStore'

vi.mock('../client/clientStore', () => ({getClientState: vi.fn()}))

function mockClient() {
  const mutations = new Subject<ListenEvent>()
  const releases = new Subject<ListenEvent>()
  const fetch = vi.fn().mockReturnValue(of({result: [], ms: 0}))
  const listen = vi.fn((query: string) => (query === '*' ? mutations : releases))
  const client = {observable: {fetch, listen}} as unknown as SanityClient
  return {client, fetch, listen, mutations, releases}
}

describe('query listener integration', () => {
  let instance: SanityInstance

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'test', dataset: 'first'})
  })

  afterEach(() => {
    instance.dispose()
    vi.useRealTimers()
  })

  it.each(['resource', 'project and dataset', 'dataset only'])(
    'invalidates queries only in their target resource using %s options',
    async (target) => {
      const first = mockClient()
      const second = mockClient()
      vi.mocked(getClientState).mockImplementation((_instance, options) => {
        const resource = options?.resource
        const {client} =
          resource && isDatasetResource(resource) && resource.dataset === 'second' ? second : first
        return {observable: of(client), getCurrent: () => client, subscribe: () => () => {}}
      })
      const resource = (dataset: string): DocumentResource => ({projectId: 'test', dataset})
      getQueryState(instance, {query: '*', resource: resource('first')}).subscribe()
      const secondOptions =
        target === 'resource'
          ? {resource: resource('second')}
          : target === 'dataset only'
            ? {dataset: 'second'}
            : {projectId: 'test', dataset: 'second'}
      const resolved = resolveQuery(instance, {query: '*', ...secondOptions})
      await vi.advanceTimersByTimeAsync(10)
      await expect(resolved).resolves.toEqual([])
      getQueryState(instance, {query: '*', ...secondOptions}).subscribe()
      await vi.advanceTimersByTimeAsync(10)
      expect(first.listen).toHaveBeenCalledTimes(1)
      expect(second.listen).toHaveBeenCalledTimes(1)
      first.mutations.next({type: 'mutation', visibility: 'query'} as ListenEvent)
      await vi.advanceTimersByTimeAsync(60)
      expect(first.fetch).toHaveBeenCalledTimes(2)
      expect(second.fetch).toHaveBeenCalledTimes(1)
      second.mutations.next({type: 'mutation', visibility: 'query'} as ListenEvent)
      await vi.advanceTimersByTimeAsync(60)
      expect(first.fetch).toHaveBeenCalledTimes(2)
      expect(second.fetch).toHaveBeenCalledTimes(2)
    },
  )

  it('recomputes a query perspective from release metadata and cancels its obsolete fetch', async () => {
    const {client, fetch, releases} = mockClient()
    vi.mocked(getClientState).mockReturnValue({
      observable: of(client),
      getCurrent: () => client,
      subscribe: () => () => {},
    })
    const release = (name: string, intendedPublishAt: string): ReleaseDocument => ({
      _id: `_.releases.${name}`,
      _type: 'system.release',
      _rev: name,
      _createdAt: '2026-09-30T00:00:00Z',
      _updatedAt: '2026-09-30T00:00:00Z',
      name,
      state: 'active',
      metadata: {releaseType: 'scheduled', intendedPublishAt},
    })
    let metadata = [release('r1', '2026-12-01T00:00:00Z')]
    const obsolete = new Subject<{result: string[]}>()
    fetch.mockImplementation(
      (query: string, _params: unknown, options: {perspective: string[]}) => {
        if (query === 'releases::all()') return of({result: metadata})
        return options.perspective.length === 2 ? obsolete : of({result: options.perspective})
      },
    )
    const state = getQueryState<string[]>(instance, {query: '*', perspective: {releaseName: 'r1'}})
    state.subscribe()
    await vi.advanceTimersByTimeAsync(10)
    expect(obsolete.observed).toBe(true)
    expect(fetch).toHaveBeenLastCalledWith(
      '*',
      undefined,
      expect.objectContaining({perspective: ['r1', 'drafts']}),
    )
    metadata = [...metadata, release('r2', '2027-01-01T00:00:00Z')]
    releases.next({
      type: 'mutation',
      documentId: '_.releases.r2',
      visibility: 'query',
    } as ListenEvent)
    await vi.advanceTimersByTimeAsync(60)
    expect(obsolete.observed).toBe(false)
    expect(state.getCurrent()).toEqual(['r1', 'r2', 'drafts'])
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})
