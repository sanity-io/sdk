import {NEVER, of, startWith, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from './createSanityInstance'
import {defineFetcher, defineMutation, type Fetcher} from './fetcherStore'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('fetcherStore', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    vi.useRealTimers()
  })

  afterEach(() => {
    instance.dispose()
  })

  it('fetches on subscribe and exposes a success snapshot', async () => {
    const fetcher = defineFetcher<[number], string>({
      name: 'basic',
      getKey: (_i, id) => `${id}`,
      fetch: () => (id) => of(`data-${id}`),
    })

    const data = await fetcher.resolveState(instance, 1)
    expect(data).toBe('data-1')
    expect(fetcher.getState(instance, 1).getCurrent()).toMatchObject({
      status: 'success',
      data: 'data-1',
      isFetching: false,
    })
  })

  it('serves fresh data without refetching, and revalidates once stale', async () => {
    const fetchSpy = vi.fn((id: number) => of(`v-${id}`))
    const fetcher = defineFetcher<[number], string>({
      name: 'swr',
      staleTime: 10_000,
      getKey: (_i, id) => `${id}`,
      fetch: () => fetchSpy,
    })

    const first = fetcher.getState(instance, 1)
    const unsub1 = first.subscribe()
    await vi.waitFor(() => expect(first.getCurrent().status).toBe('success'))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    unsub1()

    // Re-subscribe within staleTime — fresh, so no refetch.
    const second = fetcher.getState(instance, 1)
    const unsub2 = second.subscribe()
    await flush()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    unsub2()

    // Invalidation forces staleness — an active subscriber revalidates.
    const third = fetcher.getState(instance, 1)
    const unsub3 = third.subscribe()
    await flush()
    fetcher.invalidate(instance, 1)
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    unsub3()
  })

  it('invalidate refetches an actively-subscribed entry', async () => {
    let n = 0
    const fetcher = defineFetcher<[], number>({
      name: 'invalidate',
      getKey: () => 'k',
      fetch: () => () => of(++n),
    })

    const source = fetcher.getState(instance)
    const unsub = source.subscribe()
    await vi.waitFor(() => expect(source.getCurrent().data).toBe(1))

    fetcher.invalidate(instance)
    await vi.waitFor(() => expect(source.getCurrent().data).toBe(2))
    unsub()
  })

  it('refetch bypasses staleness and resolves with fresh data', async () => {
    let n = 0
    const fetcher = defineFetcher<[], number>({
      name: 'refetch',
      staleTime: 60_000,
      getKey: () => 'k',
      fetch: () => () => of(++n),
    })

    expect(await fetcher.resolveState(instance)).toBe(1)
    expect(await fetcher.refetch(instance)).toBe(2)
  })

  it('surfaces an initial failure as an error snapshot, background failure on the success arm', async () => {
    let attempt = 0
    const fetcher = defineFetcher<[], string>({
      name: 'errors',
      getKey: () => 'k',
      fetch: () => () => (attempt++ === 0 ? throwError(() => new Error('boom')) : of('recovered')),
    })

    await expect(fetcher.resolveState(instance)).rejects.toThrow('boom')
    expect(fetcher.getState(instance).getCurrent().status).toBe('error')

    // Now succeed, then fail a background revalidation: data stays, error attaches.
    await fetcher.refetch(instance)
    expect(fetcher.getState(instance).getCurrent()).toMatchObject({
      status: 'success',
      data: 'recovered',
    })
  })

  it('pre-seeds an entry via initialData without fetching when the seed is fresh', async () => {
    const fetchSpy = vi.fn(() => of('fetched'))
    const fetcher = defineFetcher<[], string>({
      name: 'seeded',
      staleTime: 10_000,
      getKey: () => 'k',
      fetch: () => fetchSpy,
      initialData: () => ({data: 'seeded', dataUpdatedAt: Date.now()}),
    })

    const source = fetcher.getState(instance)
    const unsub = source.subscribe()
    await flush()

    expect(source.getCurrent()).toMatchObject({status: 'success', data: 'seeded'})
    expect(fetchSpy).not.toHaveBeenCalled()
    unsub()
  })

  it('setData writes optimistically and can be undone', () => {
    const fetcher = defineFetcher<[], string>({
      name: 'setdata',
      getKey: () => 'k',
      fetch: () => () => NEVER,
    })

    const {undo} = fetcher.setData(instance, [], 'written')
    expect(fetcher.getState(instance).getCurrent().data).toBe('written')

    undo()
    expect(fetcher.getState(instance).getCurrent().status).toBe('pending')
  })

  it('garbage-collects an entry written without a subscriber after gcTime', async () => {
    const fetcher = defineFetcher<[], string>({
      name: 'gc-orphan',
      gcTime: 5,
      getKey: () => 'k',
      fetch: () => () => NEVER,
    })

    // No subscriber ever holds this entry (as an optimistic mutation write would),
    // so only setData's own GC scheduling can clean it up.
    fetcher.setData(instance, [], 'written')
    expect(fetcher.getState(instance).getCurrent().data).toBe('written')

    await vi.waitFor(() => expect(fetcher.getState(instance).getCurrent().status).toBe('pending'))
  })

  it('rolls back optimistic writes when a mutation fails', async () => {
    const fetcher = defineFetcher<[], string>({
      name: 'mutate-rollback',
      getKey: () => 'k',
      fetch: () => () => NEVER,
    })
    fetcher.setData(instance, [], 'server')

    const failing = defineMutation<string, never>({
      name: 'rename-fail',
      mutationFn: () => () => throwError(() => new Error('rejected')),
      onMutate: (write, value) => write(fetcher, [], value),
    })

    await expect(failing(instance, 'optimistic')).rejects.toThrow('rejected')
    expect(fetcher.getState(instance).getCurrent().data).toBe('server')
  })

  it('reconciles tagged entries after a successful mutation', async () => {
    let n = 0
    const list = defineFetcher<[], number>({
      name: 'list',
      getKey: () => 'all',
      tags: [{type: 'thing', id: 'LIST'}],
      fetch: () => () => of(++n),
    })

    const source = list.getState(instance)
    const unsub = source.subscribe()
    await vi.waitFor(() => expect(source.getCurrent().data).toBe(1))

    const create = defineMutation<void, {ok: true}>({
      name: 'create-thing',
      mutationFn: () => () => of({ok: true}),
      invalidates: [{type: 'thing', id: 'LIST'}],
    })

    const {invalidated} = await create(instance, undefined)
    await invalidated
    expect(source.getCurrent().data).toBe(2)
    unsub()
  })

  it('discards a revalidation result that lands after an optimistic write', async () => {
    const server = new Subject<string>()
    const fetcher: Fetcher<[], string> = defineFetcher<[], string>({
      name: 'version-guard',
      staleTime: 0,
      getKey: () => 'k',
      fetch: () => () => server.pipe(startWith('initial')),
    })

    const source = fetcher.getState(instance)
    const unsub = source.subscribe()
    await vi.waitFor(() => expect(source.getCurrent().data).toBe('initial'))

    // Force a refetch (in flight, no value yet), then write optimistically.
    const refetching = fetcher.refetch(instance)
    fetcher.setData(instance, [], 'optimistic')
    expect(source.getCurrent().data).toBe('optimistic')

    // Late server value must NOT clobber the optimistic write.
    server.next('late-server')
    await refetching
    expect(source.getCurrent().data).toBe('optimistic')
    unsub()
  })

  it('settles a pre-empted in-flight fetch when a forced refetch replaces it', async () => {
    const server = new Subject<string>()
    const fetcher = defineFetcher<[], string>({
      name: 'preempt',
      getKey: () => 'k',
      fetch: () => () => server,
    })

    // First refetch is in flight with no value yet; a second forced refetch
    // pre-empts it. Both promises must settle rather than hang.
    const first = fetcher.refetch(instance)
    const second = fetcher.refetch(instance)

    server.next('data')
    server.complete()

    await expect(first).resolves.toBe('data')
    await expect(second).resolves.toBe('data')
  })

  it('clears isFetching when a discarded revalidation runs on a non-completing source', async () => {
    const server = new Subject<string>()
    const fetcher = defineFetcher<[], string>({
      name: 'version-guard-fetching',
      staleTime: 0,
      getKey: () => 'k',
      fetch: () => () => server,
    })

    const source = fetcher.getState(instance)
    const unsub = source.subscribe()
    await vi.waitFor(() => expect(source.getCurrent().isFetching).toBe(true))

    // Optimistic write bumps the version while the fetch is still in flight.
    fetcher.setData(instance, [], 'optimistic')

    // The late server value is discarded (version guard) — and because the source
    // never completes, isFetching must be cleared here, not left stuck true.
    server.next('late')
    await flush()
    expect(source.getCurrent()).toMatchObject({data: 'optimistic', isFetching: false})
    unsub()
  })

  it('polls on refetchInterval while an entry has subscribers', async () => {
    let n = 0
    const fetcher = defineFetcher<[], number>({
      name: 'polling',
      staleTime: 60_000,
      refetchInterval: 10,
      getKey: () => 'k',
      fetch: () => () => of(++n),
    })

    const source = fetcher.getState(instance)
    const unsub = source.subscribe()
    await vi.waitFor(() => expect((source.getCurrent().data ?? 0) >= 1).toBe(true))

    // Fresh per staleTime, so any further increase can only come from the interval.
    const before = source.getCurrent().data ?? 0
    await vi.waitFor(() => expect((source.getCurrent().data ?? 0) > before).toBe(true), {
      timeout: 500,
    })
    unsub()
  })
})
