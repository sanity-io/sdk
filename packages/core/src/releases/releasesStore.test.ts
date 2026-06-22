import {type ReleaseDocument} from '@sanity/client'
import {defer, NEVER, Observable, type Observer, of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getQueryState, resolveQuery} from '../query/queryStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getActiveReleasesState, getAllReleasesState} from './releasesStore'

// Mock dependencies
vi.mock('../query/queryStore')

describe('releasesStore', () => {
  let instance: SanityInstance

  beforeEach(() => {
    vi.clearAllMocks()

    instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    vi.mocked(getQueryState).mockReturnValue({
      subscribe: () => () => {},
      getCurrent: () => undefined,
      observable: NEVER as Observable<ReleaseDocument[] | undefined>,
    } as StateSource<ReleaseDocument[] | undefined>)

    vi.mocked(resolveQuery).mockResolvedValue(undefined)
  })

  afterEach(() => {
    instance.dispose()
  })

  it('supports calls without options', () => {
    const state = getActiveReleasesState(instance)

    expect(state.getCurrent()).toBeUndefined()
    expect(getQueryState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        query: 'releases::all()',
        perspective: 'raw',
        tag: 'releases',
        resource: {dataset: 'test', projectId: 'test'},
      }),
    )
  })

  it('should set active releases state when the releases query emits', async () => {
    const teardown = vi.fn()
    const subscriber = vi
      .fn<(observer: Observer<ReleaseDocument[] | undefined>) => () => void>()
      .mockReturnValue(teardown)

    vi.mocked(getQueryState).mockReturnValue({
      subscribe: () => () => {},
      getCurrent: () => undefined,
      observable: new Observable(subscriber),
    } as StateSource<ReleaseDocument[] | undefined>)

    // note that the order of the releases is important here -- they get sorted
    const mockReleases: ReleaseDocument[] = [
      {
        _id: 'r2',
        _type: 'system.release',
        name: 'Release 2',
        metadata: {title: 'R2', releaseType: 'scheduled'},
      } as ReleaseDocument,
      {
        _id: 'r1',
        _type: 'system.release',
        name: 'Release 1',
        metadata: {title: 'R1', releaseType: 'asap'},
      } as ReleaseDocument,
    ]

    const state = getActiveReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})

    const [observer] = subscriber.mock.lastCall!

    observer.next(mockReleases)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.getCurrent()).toEqual(mockReleases.reverse())
  })

  it('should update active releases state when the query emits new data', async () => {
    const releasesSubject = new Subject<ReleaseDocument[]>()
    vi.mocked(getQueryState).mockReturnValue({
      subscribe: () => () => {},
      getCurrent: () => undefined,
      observable: releasesSubject.asObservable(),
    } as StateSource<ReleaseDocument[] | undefined>)

    const state = getActiveReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})

    // Initial state should be default
    expect(state.getCurrent()).toBeUndefined() // Default initial state

    // Emit initial data
    const initialReleases: ReleaseDocument[] = [
      {
        _id: 'r1',
        _type: 'system.release',
        name: 'Initial Release 1',
        metadata: {title: 'IR1', releaseType: 'asap'},
      } as ReleaseDocument,
    ]
    releasesSubject.next(initialReleases)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.getCurrent()).toEqual(initialReleases)

    const updatedReleases: ReleaseDocument[] = [
      {
        _id: 'r2',
        _type: 'system.release',
        name: 'New Release 2',
        metadata: {title: 'NR2', releaseType: 'scheduled'},
      } as ReleaseDocument,
      {
        _id: 'r1',
        _type: 'system.release',
        name: 'Updated Release 1',
        metadata: {title: 'UR1', releaseType: 'asap'},
      } as ReleaseDocument,
    ]
    releasesSubject.next(updatedReleases)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.getCurrent()).toEqual(updatedReleases.reverse())
  })

  it('should handle empty array from the query', async () => {
    // Configure query to return an empty array
    vi.mocked(getQueryState).mockReturnValue({
      subscribe: () => () => {},
      getCurrent: () => [],
      observable: of([]),
    } as StateSource<ReleaseDocument[] | undefined>)

    const state = getActiveReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.getCurrent()).toEqual([]) // Should be set to empty array
  })

  it('should handle null/undefined from the query by defaulting to empty array', async () => {
    // Test null case
    vi.mocked(getQueryState).mockReturnValue({
      subscribe: () => () => {},
      getCurrent: () => null as unknown as ReleaseDocument[] | undefined,
      observable: of(null as unknown as ReleaseDocument[] | undefined),
    } as StateSource<ReleaseDocument[] | undefined>)
    const state = getActiveReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.getCurrent()).toEqual([])

    // Test undefined case
    vi.mocked(getQueryState).mockReturnValue({
      subscribe: () => () => {},
      getCurrent: () => undefined,
      observable: of(undefined),
    } as StateSource<ReleaseDocument[] | undefined>)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.getCurrent()).toEqual([])
  })

  it('exposes archived/published releases through getAllReleasesState but filters them out of getActiveReleasesState', async () => {
    const subject = new Subject<ReleaseDocument[]>()
    vi.mocked(getQueryState).mockReturnValue({
      subscribe: () => () => {},
      getCurrent: () => undefined,
      observable: subject.asObservable(),
    } as StateSource<ReleaseDocument[] | undefined>)

    const active = getActiveReleasesState(instance, {
      resource: {projectId: 'test', dataset: 'test'},
    })
    const all = getAllReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})

    const releases: ReleaseDocument[] = [
      {
        _id: 'r-active',
        _type: 'system.release',
        name: 'r-active',
        state: 'active',
        metadata: {releaseType: 'asap'},
      } as ReleaseDocument,
      {
        _id: 'r-archived',
        _type: 'system.release',
        name: 'r-archived',
        state: 'archived',
        metadata: {releaseType: 'asap'},
      } as ReleaseDocument,
      {
        _id: 'r-published',
        _type: 'system.release',
        name: 'r-published',
        state: 'published',
        metadata: {releaseType: 'asap'},
      } as ReleaseDocument,
    ]

    subject.next(releases)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const activeNames = active.getCurrent()?.map((r) => r.name) ?? []
    const allNames = all.getCurrent()?.map((r) => r.name) ?? []

    expect(activeNames).toEqual(['r-active'])
    expect(allNames).toEqual(expect.arrayContaining(['r-active', 'r-archived', 'r-published']))
    expect(allNames).toHaveLength(3)
  })

  it('recovers via retry when a transient query error is followed by success', async () => {
    vi.useFakeTimers()
    try {
      const release = {
        _id: '_.releases.r-active',
        _type: 'system.release',
        name: 'r-active',
        state: 'active',
        metadata: {releaseType: 'asap'},
      } as ReleaseDocument

      let attempts = 0
      const source = defer(() => {
        attempts += 1
        return attempts === 1 ? throwError(() => new Error('transient blip')) : of([release])
      })
      vi.mocked(getQueryState).mockReturnValue({
        subscribe: () => () => {},
        getCurrent: () => undefined,
        observable: source,
      } as StateSource<ReleaseDocument[] | undefined>)

      const active = getActiveReleasesState(instance, {
        resource: {projectId: 'test', dataset: 'test'},
      })

      // First attempt errors; after the backoff delay the retry re-subscribes
      // and the second attempt succeeds — no error should surface.
      await vi.advanceTimersByTimeAsync(600)

      expect(attempts).toBe(2)
      expect(() => active.getCurrent()).not.toThrow()
      expect(active.getCurrent()?.map((r) => r.name)).toEqual(['r-active'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('surfaces the error only after retries are exhausted', async () => {
    vi.useFakeTimers()
    try {
      // A permanently-errored subject re-errors every re-subscription, so the
      // retry budget is exhausted and the error is ultimately surfaced.
      const subject = new Subject<ReleaseDocument[]>()
      vi.mocked(getQueryState).mockReturnValue({
        subscribe: () => () => {},
        getCurrent: () => undefined,
        observable: subject.asObservable(),
      } as StateSource<ReleaseDocument[] | undefined>)

      const active = getActiveReleasesState(instance, {
        resource: {projectId: 'test', dataset: 'test'},
      })
      const all = getAllReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})

      const error = new Error('Query failed')
      subject.error(error)

      // While retries are still pending, the error is not yet surfaced.
      await vi.advanceTimersByTimeAsync(0)
      expect(() => active.getCurrent()).not.toThrow()

      // After all backoff delays elapse (500+1000+2000+4000+8000ms), the error
      // is surfaced rather than silently swallowed.
      await vi.advanceTimersByTimeAsync(20_000)
      expect(() => active.getCurrent()).toThrow(error)
      expect(() => all.getCurrent()).toThrow(error)
    } finally {
      vi.useRealTimers()
    }
  })
})
