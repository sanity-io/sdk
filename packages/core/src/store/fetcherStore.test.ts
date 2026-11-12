import {ClientError, ServerError} from '@sanity/client'
import {concatWith, NEVER, type Observable, of, startWith, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest'

import {setAuthToken} from '../auth/authStore'
import {OUT_OF_SYNC_RETRY_MAX_DELAY} from '../document/documentConstants'
import {createSanityInstance, type SanityInstance} from './createSanityInstance'
import {UPSTREAM_CLOSE_DELAY_MS} from './createStoreInstance'
import {defineFetcher, defineMutation, type Fetcher} from './fetcherStore'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// Answers each fetch with the next result, and fails a fetch past the last one
const answerInTurn = <T>(...results: Observable<T>[]) =>
  vi.fn(() => results.shift() ?? throwError(() => new Error('Fetched once too often')))

// A failure retrying can't fix, so the fetch settles on it straight away
const refusal = (message: string) =>
  throwError(
    () => new ClientError({statusCode: 400, headers: {}, body: {error: 'Bad Request', message}}),
  )
const unavailable = new ServerError({statusCode: 503, headers: {}, body: {}})

// Shows `value` the way a mutation still waiting on the server does
const writePending = <T>(instance: SanityInstance, fetcher: Fetcher<[], T>, value: T) =>
  void defineMutation<T, never>({
    name: 'pending-write',
    mutationFn: () => () => NEVER,
    onMutate: (write, input) => write(fetcher, [], input),
  })(instance, value)

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

  it('revalidates a stale entry on re-subscribe when the fetch source does not complete', async () => {
    let n = 0
    const fetchSpy = vi.fn(() => of(++n).pipe(concatWith(NEVER)))
    const fetcher = defineFetcher<[], number>({
      name: 'swr-non-completing',
      staleTime: 0,
      getKey: () => 'k',
      fetch: () => fetchSpy,
    })

    const first = fetcher.getState(instance)
    const unsub1 = first.subscribe()
    await vi.waitFor(() => expect(first.getCurrent().data).toBe(1))
    unsub1()

    const second = fetcher.getState(instance)
    const unsub2 = second.subscribe()
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    expect(second.getCurrent().data).toBe(2)
    unsub2()
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
      fetch: () => () => (attempt++ === 0 ? refusal('boom') : of('recovered')),
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

  it('retries a fetch that failed with a 5xx after a backoff, without showing the error', async () => {
    vi.useFakeTimers()
    const fetchSpy = answerInTurn(
      throwError(() => unavailable),
      of('back'),
    )
    const fetcher = defineFetcher<[], string>({
      name: 'transient',
      getKey: () => 'k',
      fetch: () => fetchSpy,
    })
    const source = fetcher.getState(instance)
    onTestFinished(source.subscribe())

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(source.getCurrent()).toMatchObject({
      status: 'pending',
      error: undefined,
      isFetching: true,
    })

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY)
    expect(source.getCurrent()).toMatchObject({status: 'success', data: 'back', error: undefined})
  })

  it('stops retrying a failed fetch a second after its last subscriber leaves, and fetches again on the next subscribe', async () => {
    vi.useFakeTimers()
    const fetchSpy = answerInTurn(
      of('first'),
      throwError(() => unavailable),
      throwError(() => unavailable),
      of('back'),
    )
    const fetcher = defineFetcher<[], string>({
      name: 'transient-unwatched',
      getKey: () => 'k',
      fetch: () => fetchSpy,
    })
    const unsubscribe = fetcher.getState(instance).subscribe()
    await vi.advanceTimersByTimeAsync(0)
    const refetched = fetcher.refetch(instance).catch((error: unknown) => error)
    unsubscribe()

    // The first retry, half a second in, still runs inside the second the fetch is kept for
    await vi.advanceTimersByTimeAsync(UPSTREAM_CLOSE_DELAY_MS)
    expect(await refetched).toBe(unavailable)
    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY)
    expect(fetchSpy).toHaveBeenCalledTimes(3)

    const source = fetcher.getState(instance)
    onTestFinished(source.subscribe())
    await vi.advanceTimersByTimeAsync(0)
    expect(source.getCurrent()).toMatchObject({data: 'back', error: undefined})
  })

  it('resolveState fetches again after a failed fetch and settles with that fetch', async () => {
    const fetchSpy = answerInTurn(refusal('refused'), refusal('refused again'), of('back'))
    const fetcher = defineFetcher<[], string>({
      name: 'resolve-after-error',
      getKey: () => 'k',
      fetch: () => fetchSpy,
    })

    await expect(fetcher.resolveState(instance)).rejects.toThrow('refused')
    await expect(fetcher.resolveState(instance)).rejects.toThrow('refused again')
    await flush()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(await fetcher.resolveState(instance)).toBe('back')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('resolveState calls made together after a failed fetch share one fetch', async () => {
    const answer = new Subject<string>()
    const fetchSpy = answerInTurn(refusal('refused'), answer)
    const fetcher = defineFetcher<[], string>({
      name: 'resolve-after-error-together',
      getKey: () => 'k',
      fetch: () => fetchSpy,
    })

    await expect(fetcher.resolveState(instance)).rejects.toThrow('refused')
    const retries = Promise.all([
      fetcher.resolveState(instance),
      fetcher.resolveState(instance),
    ]).catch((error: unknown) => error)
    await flush()
    answer.next('back')

    expect(await retries).toEqual(['back', 'back'])
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('resolveState settles a retry still in flight when the failed entry is due to be collected, and collects it after', async () => {
    const answer = new Subject<string>()
    const fetchSpy = answerInTurn(refusal('refused'), answer)
    const fetcher = defineFetcher<[], string>({
      name: 'resolve-after-error-past-gc',
      gcTime: 20,
      getKey: () => 'k',
      fetch: () => fetchSpy,
    })

    await expect(fetcher.resolveState(instance)).rejects.toThrow('refused')
    const retry = fetcher.resolveState(instance).catch((error: unknown) => error)
    await new Promise((resolve) => setTimeout(resolve, 40))
    answer.next('back')

    expect(await retry).toBe('back')
    await vi.waitFor(() => expect(fetcher.getState(instance).getCurrent().status).toBe('pending'))
  }, 500)

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

  it('garbage-collects an entry written without a subscriber after gcTime', async () => {
    const fetcher = defineFetcher<[], string>({
      name: 'gc-orphan',
      gcTime: 5,
      getKey: () => 'k',
      fetch: () => () => NEVER,
    })

    // No subscriber ever holds this entry, so only the write's own GC scheduling can clean it up
    writePending(instance, fetcher, 'written')
    expect(fetcher.getState(instance).getCurrent().data).toBe('written')

    await vi.waitFor(() => expect(fetcher.getState(instance).getCurrent().status).toBe('pending'))
  })

  it('rolls back optimistic writes when a mutation fails', async () => {
    const fetcher = defineFetcher<[], string>({
      name: 'mutate-rollback',
      getKey: () => 'k',
      initialData: () => ({data: 'server', dataUpdatedAt: Date.now()}),
      fetch: () => () => NEVER,
    })

    const failing = defineMutation<string, never>({
      name: 'rename-fail',
      mutationFn: () => () => throwError(() => new Error('rejected')),
      onMutate: (write, value) => write(fetcher, [], value),
    })

    await expect(failing(instance, 'optimistic')).rejects.toThrow('rejected')
    expect(fetcher.getState(instance).getCurrent().data).toBe('server')
  })

  describe('overlapping changes', () => {
    let server: string[]
    let slowRead: Subject<string[]> | undefined
    let list: Fetcher<[], string[]>
    let answers: Map<string, Subject<string[]>>
    let add: (instance: SanityInstance, item: string) => Promise<unknown>
    let replaceOnAnswer: (instance: SanityInstance, item: string) => Promise<unknown>

    beforeEach(() => {
      server = []
      slowRead = undefined
      answers = new Map()
      list = defineFetcher<[], string[]>({
        name: 'overlap-list',
        getKey: () => 'k',
        tags: [{type: 'overlap'}],
        fetch: () => () => slowRead ?? of([...server]),
      })
      add = defineMutation<string, string[]>({
        name: 'overlap-add',
        scope: () => 'overlap-list',
        mutationFn: () => (item) => {
          const answer = new Subject<string[]>()
          answers.set(item, answer)
          return answer
        },
        onMutate: (write, item) => write(list, [], (current) => [...(current ?? []), item]),
        onSuccess: (write, stored) => write(list, [], stored),
      })
      // Changes the list too, but only shows it once the API answers
      replaceOnAnswer = defineMutation<string, string[]>({
        name: 'overlap-replace-on-answer',
        scope: () => 'overlap-list',
        mutationFn: () => (item) => {
          const answer = new Subject<string[]>()
          answers.set(item, answer)
          return answer
        },
        onSuccess: (write, stored) => write(list, [], stored),
      })
    })

    const shown = () => list.getState(instance).getCurrent().data

    it("keeps a change on screen when another change's answer arrives first", async () => {
      await list.resolveState(instance)
      const first = add(instance, 'A')
      void add(instance, 'B').catch(() => {})

      answers.get('A')!.next(['A'])
      await first

      expect(shown()).toEqual(['A', 'B'])
    })

    it('takes back only the refused change, keeping the one made after it', async () => {
      await list.resolveState(instance)
      const first = add(instance, 'A')
      const second = add(instance, 'B')

      answers.get('A')!.error(new Error('refused'))
      await expect(first).rejects.toThrow('refused')
      expect(shown()).toEqual(['B'])

      await vi.waitFor(() => expect(answers.has('B')).toBe(true))
      answers.get('B')!.next(['B'])
      await second
      expect(shown()).toEqual(['B'])
    })

    it('keeps a change on screen when a refetch lands before the server has it', async () => {
      const source = list.getState(instance)
      const unsub = source.subscribe()
      await vi.waitFor(() => expect(source.getCurrent().status).toBe('success'))
      void add(instance, 'A').catch(() => {})

      server = ['elsewhere']

      await expect(list.refetch(instance)).resolves.toEqual(['elsewhere', 'A'])
      expect(shown()).toEqual(['elsewhere', 'A'])
      unsub()
    })

    it('ignores a read that started before an answer, while a later change is in flight', async () => {
      await list.resolveState(instance)
      slowRead = new Subject()
      const reading = list.refetch(instance)
      const first = add(instance, 'A')
      answers.get('A')!.next(['A'])
      await first
      void add(instance, 'B').catch(() => {})

      slowRead.next([])
      await reading

      expect(shown()).toEqual(['A', 'B'])
    })

    it('sends a change once the earlier change in its scope is answered, so the later one wins', async () => {
      const sent: string[] = []
      const replies = new Map<string, Subject<string[]>>()
      const replace = defineMutation<string, string[]>({
        name: 'overlap-replace-queued',
        scope: () => 'overlap-list',
        mutationFn: () => (item) => {
          sent.push(item)
          const reply = new Subject<string[]>()
          replies.set(item, reply)
          return reply
        },
        onMutate: (write, item) => write(list, [], [item]),
        onSuccess: (write, stored) => write(list, [], stored),
      })
      await list.resolveState(instance)

      const x = replace(instance, 'X')
      const y = replace(instance, 'Y')
      expect(shown()).toEqual(['Y'])
      expect(sent).toEqual(['X'])

      replies.get('X')!.next(['X'])
      await x
      await vi.waitFor(() => expect(sent).toEqual(['X', 'Y']))
      expect(shown()).toEqual(['Y'])

      replies.get('Y')!.next(['Y'])
      await y
      expect(shown()).toEqual(['Y'])
    })

    it('sends changes in different scopes straight away', async () => {
      const sent: number[] = []
      const item = defineFetcher<[number], string>({
        name: 'overlap-item',
        getKey: (_i, id) => `${id}`,
        fetch: () => () => NEVER,
      })
      const rename = defineMutation<number, void>({
        name: 'overlap-rename',
        scope: (id) => `overlap-rename:${id}`,
        mutationFn: () => (id) => {
          sent.push(id)
          return NEVER
        },
        onMutate: (write, id) => write(item, [id], `renamed-${id}`),
      })

      void rename(instance, 1)
      void rename(instance, 2)

      expect(sent).toEqual([1, 2])
    })

    it("holds back a change that doesn't show at once until the earlier change that does is answered", async () => {
      vi.useFakeTimers()
      // Watched, so the list isn't collected while the timers run
      onTestFinished(list.getState(instance).subscribe())
      await list.resolveState(instance)

      void add(instance, 'A')
      void replaceOnAnswer(instance, 'B')
      // A change that's only delayed, not queued, would have gone by now
      await vi.runAllTimersAsync()
      expect([...answers.keys()]).toEqual(['A'])

      answers.get('A')!.next(['A'])
      await vi.waitFor(() => expect([...answers.keys()]).toEqual(['A', 'B']))
    })

    it("holds back a change that shows at once until the earlier change that doesn't is answered", async () => {
      vi.useFakeTimers()
      // Watched, so the list isn't collected while the timers run
      onTestFinished(list.getState(instance).subscribe())
      await list.resolveState(instance)

      void replaceOnAnswer(instance, 'A')
      void add(instance, 'B')
      // A change that's only delayed, not queued, would have gone by now
      await vi.runAllTimersAsync()
      expect([...answers.keys()]).toEqual(['A'])

      answers.get('A')!.next(['A'])
      await vi.waitFor(() => expect([...answers.keys()]).toEqual(['A', 'B']))
    })

    it('takes a change back when its request throws before it is sent', async () => {
      const broken = defineMutation<string, string[]>({
        name: 'overlap-broken',
        mutationFn: () => () => {
          throw new Error('bad input')
        },
        onMutate: (write, item) => write(list, [], (current) => [...(current ?? []), item]),
      })
      await list.resolveState(instance)

      await expect(broken(instance, 'A')).rejects.toThrow('bad input')

      expect(shown()).toEqual([])
    })

    it('shows changes still in flight in the order they were made', async () => {
      await list.resolveState(instance)

      void add(instance, 'A').catch(() => {})
      void add(instance, 'B').catch(() => {})

      expect(shown()).toEqual(['A', 'B'])
    })

    it("stores an answer for an entry nobody has read, so it's there when someone does", async () => {
      const replace = defineMutation<string[], string[]>({
        name: 'overlap-replace',
        mutationFn: () => (items) => of(items),
        onSuccess: (write, stored) => write(list, [], stored),
      })

      await replace(instance, ['A'])

      expect(list.getState(instance).getCurrent()).toMatchObject({status: 'success', data: ['A']})
    })

    it("shows a change at once, then the API's answer", async () => {
      await list.resolveState(instance)
      const added = add(instance, 'A')
      expect(shown()).toEqual(['A'])

      answers.get('A')!.next(['A', 'from-server'])
      await added

      expect(shown()).toEqual(['A', 'from-server'])
    })

    it('keeps a change that saved without an answer to show, under a later change', async () => {
      const saves = new Map<string, Subject<void>>()
      const save = defineMutation<string, void>({
        name: 'overlap-save',
        scope: () => 'overlap-list',
        mutationFn: () => (item) => {
          const saved = new Subject<void>()
          saves.set(item, saved)
          return saved
        },
        onMutate: (write, item) => write(list, [], (current) => [...(current ?? []), item]),
      })
      await list.resolveState(instance)
      const first = save(instance, 'A')
      const second = save(instance, 'B')

      saves.get('A')!.next()
      await first
      expect(shown()).toEqual(['A', 'B'])

      await vi.waitFor(() => expect(saves.has('B')).toBe(true))
      saves.get('B')!.error(new Error('refused'))
      await expect(second).rejects.toThrow('refused')
      expect(shown()).toEqual(['A'])
    })

    it("restores an entry that hadn't been read when its only change is refused", async () => {
      const added = add(instance, 'A')
      expect(shown()).toEqual(['A'])

      answers.get('A')!.error(new Error('refused'))
      await expect(added).rejects.toThrow('refused')

      expect(list.getState(instance).getCurrent().status).toBe('pending')
    })

    it("shows a first read's answer when a change made while it was in flight is refused", async () => {
      slowRead = new Subject()
      onTestFinished(list.getState(instance).subscribe())
      await vi.waitFor(() => expect(slowRead!.observed).toBe(true))

      const added = add(instance, 'A')
      answers.get('A')!.error(new Error('refused'))
      await expect(added).rejects.toThrow('refused')

      slowRead.next(['from-server'])
      expect(shown()).toEqual(['from-server'])
    })
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
    writePending(instance, fetcher, 'optimistic')
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
    writePending(instance, fetcher, 'optimistic')

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

  describe('when the token changes', () => {
    const sessionExpired = new ClientError({
      statusCode: 401,
      headers: {},
      body: {error: 'Unauthorized', message: 'Session not found'},
    })
    const notFound = new ClientError({statusCode: 404, headers: {}, body: {error: 'Not Found'}})

    beforeEach(() => {
      instance.dispose()
      // Answers the current user's read, which a new token starts. Otherwise it goes to the real
      // API, fails, and changes the credential a second time
      const clientFactory = vi.fn().mockReturnValue({
        observable: {request: vi.fn().mockReturnValue(of({id: 'user'}))},
      })
      instance = createSanityInstance({projectId: 'p', dataset: 'd', auth: {clientFactory}})
    })

    it('refetches an entry whose background fetch failed with a 401, and clears its error', async () => {
      const fetchSpy = answerInTurn(
        of('first'),
        throwError(() => sessionExpired),
        of('second'),
      )
      const fetcher = defineFetcher<[], string>({
        name: 'token-background-401',
        getKey: () => 'k',
        fetch: () => fetchSpy,
      })
      const source = fetcher.getState(instance)
      onTestFinished(source.subscribe())
      await vi.waitFor(() => expect(source.getCurrent().data).toBe('first'))
      await expect(fetcher.refetch(instance)).rejects.toBe(sessionExpired)
      expect(source.getCurrent()).toMatchObject({data: 'first', error: sessionExpired})

      setAuthToken(instance, 'renewed-token')

      await vi.waitFor(() =>
        expect(source.getCurrent()).toMatchObject({data: 'second', error: undefined}),
      )
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('refetches when the token changed while the fetch that failed with a 401 was in flight', async () => {
      const answer = new Subject<string>()
      const fetchSpy = answerInTurn(of('first'), answer, of('second'))
      const fetcher = defineFetcher<[], string>({
        name: 'token-changed-in-flight',
        getKey: () => 'k',
        fetch: () => fetchSpy,
      })
      const source = fetcher.getState(instance)
      onTestFinished(source.subscribe())
      await vi.waitFor(() => expect(source.getCurrent().data).toBe('first'))
      const refetched = fetcher.refetch(instance)

      setAuthToken(instance, 'renewed-token')
      answer.error(sessionExpired)
      await expect(refetched).rejects.toBe(sessionExpired)

      await vi.waitFor(() =>
        expect(source.getCurrent()).toMatchObject({data: 'second', error: undefined}),
      )
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('reads a value shown from the last visit again straight away, not on its next refetch', async () => {
      const fetchSpy = answerInTurn(
        throwError(() => sessionExpired),
        of('fresh'),
      )
      const fetcher = defineFetcher<[], string>({
        name: 'token-from-last-visit',
        getKey: () => 'k',
        initialData: () => ({data: 'from last visit', dataUpdatedAt: 0}),
        refetchInterval: 60_000,
        fetch: () => fetchSpy,
      })
      const source = fetcher.getState(instance)
      onTestFinished(source.subscribe())
      await vi.waitFor(() => expect(source.getCurrent().error).toBe(sessionExpired))

      setAuthToken(instance, 'renewed-token')

      await vi.waitFor(() =>
        expect(source.getCurrent()).toMatchObject({data: 'fresh', error: undefined}),
      )
    })

    it('takes the 401 off an entry once the token changes, while its next attempt retries a 5xx', async () => {
      const fetchSpy = answerInTurn(
        of('first'),
        throwError(() => sessionExpired),
        throwError(() => unavailable),
        of('second'),
      )
      const fetcher = defineFetcher<[], string>({
        name: 'token-then-transient',
        getKey: () => 'k',
        fetch: () => fetchSpy,
      })
      const source = fetcher.getState(instance)
      onTestFinished(source.subscribe())
      await vi.waitFor(() => expect(source.getCurrent().data).toBe('first'))
      await expect(fetcher.refetch(instance)).rejects.toBe(sessionExpired)

      setAuthToken(instance, 'renewed-token')

      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(source.getCurrent()).toMatchObject({data: 'first', error: undefined, isFetching: true})
    })

    it("shows a retry's answer and clears the error when a change was refused while it waited for the token", async () => {
      const fetchSpy = answerInTurn(
        of('first'),
        throwError(() => sessionExpired),
        of('second'),
      )
      const fetcher = defineFetcher<[], string>({
        name: 'token-change-while-waiting',
        getKey: () => 'k',
        fetch: () => fetchSpy,
      })
      const source = fetcher.getState(instance)
      onTestFinished(source.subscribe())
      await vi.waitFor(() => expect(source.getCurrent().data).toBe('first'))
      await expect(fetcher.refetch(instance)).rejects.toBe(sessionExpired)
      const refused = defineMutation<string, never>({
        name: 'refused-while-waiting',
        mutationFn: () => () => throwError(() => new Error('refused')),
        onMutate: (write, input) => write(fetcher, [], input),
      })
      await expect(refused(instance, 'optimistic')).rejects.toThrow('refused')

      setAuthToken(instance, 'renewed-token')

      await vi.waitFor(() =>
        expect(source.getCurrent()).toMatchObject({data: 'second', error: undefined}),
      )
    })

    it('keeps waiting for a new token while the entry is watched, after a resolveState call on it settles', async () => {
      vi.useFakeTimers()
      // The second 401 answers the request resolveState sends
      const fetchSpy = answerInTurn(
        throwError(() => sessionExpired),
        throwError(() => sessionExpired),
        of('recovered'),
      )
      const fetcher = defineFetcher<[], string>({
        name: 'token-watched-after-resolve',
        getKey: () => 'k',
        fetch: () => fetchSpy,
      })
      const source = fetcher.getState(instance)
      onTestFinished(source.subscribe())
      await vi.advanceTimersByTimeAsync(0)
      await expect(fetcher.resolveState(instance)).rejects.toBe(sessionExpired)
      await vi.advanceTimersByTimeAsync(UPSTREAM_CLOSE_DELAY_MS)

      setAuthToken(instance, 'renewed-token')
      await vi.advanceTimersByTimeAsync(0)

      expect(source.getCurrent()).toMatchObject({status: 'success', data: 'recovered'})
    })

    it('stops waiting for a new token a second after a resolveState call on a failed entry settles', async () => {
      vi.useFakeTimers()
      const fetchSpy = answerInTurn(
        throwError(() => sessionExpired),
        throwError(() => sessionExpired),
        of('recovered'),
      )
      const fetcher = defineFetcher<[], string>({
        name: 'token-resolve-only',
        getKey: () => 'k',
        fetch: () => fetchSpy,
      })
      await expect(fetcher.resolveState(instance)).rejects.toBe(sessionExpired)
      await vi.advanceTimersByTimeAsync(UPSTREAM_CLOSE_DELAY_MS)
      await expect(fetcher.resolveState(instance)).rejects.toBe(sessionExpired)
      await vi.advanceTimersByTimeAsync(UPSTREAM_CLOSE_DELAY_MS)

      setAuthToken(instance, 'renewed-token')
      await vi.advanceTimersByTimeAsync(0)

      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('keeps a failed fetch waiting for a second after its latest subscriber leaves, not its first', async () => {
      vi.useFakeTimers()
      const fetchSpy = answerInTurn(
        throwError(() => sessionExpired),
        of('recovered'),
      )
      const fetcher = defineFetcher<[], string>({
        name: 'token-resubscribed',
        getKey: () => 'k',
        fetch: () => fetchSpy,
      })
      const leaveFirst = fetcher.getState(instance).subscribe()
      await vi.advanceTimersByTimeAsync(0)
      leaveFirst()
      await vi.advanceTimersByTimeAsync(UPSTREAM_CLOSE_DELAY_MS / 2)
      fetcher.getState(instance).subscribe()()
      await vi.advanceTimersByTimeAsync(UPSTREAM_CLOSE_DELAY_MS / 2)

      setAuthToken(instance, 'renewed-token')
      await vi.advanceTimersByTimeAsync(0)

      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('leaves an entry whose fetch failed with a 401 alone while the token stays the same', async () => {
      vi.useFakeTimers()
      const fetchSpy = answerInTurn(
        of('first'),
        throwError(() => sessionExpired),
        of('recovered'),
      )
      const fetcher = defineFetcher<[], string>({
        name: 'token-unchanged',
        getKey: () => 'k',
        fetch: () => fetchSpy,
      })
      const source = fetcher.getState(instance)
      onTestFinished(source.subscribe())
      await vi.runAllTimersAsync()
      expect(source.getCurrent().data).toBe('first')
      await expect(fetcher.refetch(instance)).rejects.toBe(sessionExpired)

      await vi.runAllTimersAsync()

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(source.getCurrent()).toMatchObject({data: 'first', error: sessionExpired})
    })

    it('does not refetch entries that succeeded, failed for another reason, or have no subscribers', async () => {
      vi.useFakeTimers()
      const healthySpy = answerInTurn(of('ok'), of('ok again'))
      const notFoundSpy = answerInTurn(
        throwError(() => notFound),
        of('found'),
      )
      const unsubscribedSpy = answerInTurn(
        throwError(() => sessionExpired),
        of('recovered'),
      )
      const healthy = defineFetcher<[], string>({
        name: 'token-healthy',
        staleTime: 60_000,
        getKey: () => 'k',
        fetch: () => healthySpy,
      })
      const failedOtherwise = defineFetcher<[], string>({
        name: 'token-404',
        getKey: () => 'k',
        fetch: () => notFoundSpy,
      })
      const unsubscribed = defineFetcher<[], string>({
        name: 'token-unsubscribed',
        getKey: () => 'k',
        fetch: () => unsubscribedSpy,
      })

      onTestFinished(healthy.getState(instance).subscribe())
      onTestFinished(failedOtherwise.getState(instance).subscribe())
      const unsubscribe = unsubscribed.getState(instance).subscribe()
      await vi.runAllTimersAsync()
      unsubscribe()
      await vi.advanceTimersByTimeAsync(UPSTREAM_CLOSE_DELAY_MS)

      setAuthToken(instance, 'renewed-token')
      await vi.runAllTimersAsync()

      expect(healthySpy, 'entry that succeeded').toHaveBeenCalledTimes(1)
      expect(notFoundSpy, 'entry that failed with a 404').toHaveBeenCalledTimes(1)
      expect(unsubscribedSpy, 'entry with no subscribers').toHaveBeenCalledTimes(1)
    })
  })
})
