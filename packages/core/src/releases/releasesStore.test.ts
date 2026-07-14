import {type ReleaseDocument} from '@sanity/client'
import {NEVER, Observable, type Observer, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {observeReleases} from './observeReleases'
import {getActiveReleasesState, getAllReleasesState} from './releasesStore'

// Mock dependencies
vi.mock('./observeReleases')

describe('releasesStore', () => {
  let instance: SanityInstance

  beforeEach(() => {
    vi.clearAllMocks()

    instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    vi.mocked(observeReleases).mockReturnValue(NEVER as Observable<ReleaseDocument[] | undefined>)
  })

  afterEach(() => {
    instance.dispose()
  })

  it('supports calls without options', () => {
    const state = getActiveReleasesState(instance)

    expect(state.getCurrent()).toBeUndefined()
    expect(observeReleases).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        resource: {dataset: 'test', projectId: 'test'},
        onCorsError: expect.any(Function),
      }),
    )
  })

  it('should set active releases state when the releases query emits', async () => {
    const teardown = vi.fn()
    const subscriber = vi
      .fn<(observer: Observer<ReleaseDocument[] | undefined>) => () => void>()
      .mockReturnValue(teardown)

    vi.mocked(observeReleases).mockReturnValue(new Observable(subscriber))

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
    vi.mocked(observeReleases).mockReturnValue(releasesSubject.asObservable())

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
    // Configure the releases source to return an empty array
    vi.mocked(observeReleases).mockReturnValue(of([]))

    const state = getActiveReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.getCurrent()).toEqual([]) // Should be set to empty array
  })

  it('should handle null/undefined from the query by defaulting to empty array', async () => {
    // Test null case
    vi.mocked(observeReleases).mockReturnValue(of(null as unknown as ReleaseDocument[] | undefined))
    const state = getActiveReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.getCurrent()).toEqual([])

    // Test undefined case
    vi.mocked(observeReleases).mockReturnValue(of(undefined))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.getCurrent()).toEqual([])
  })

  it('exposes archived/published releases through getAllReleasesState but filters them out of getActiveReleasesState', async () => {
    const subject = new Subject<ReleaseDocument[]>()
    vi.mocked(observeReleases).mockReturnValue(subject.asObservable())

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

  it('surfaces CORS errors from the live connection as a store-wide error', async () => {
    const subject = new Subject<ReleaseDocument[]>()
    vi.mocked(observeReleases).mockReturnValue(subject.asObservable())

    const state = getActiveReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})

    subject.next([
      {
        _id: 'r1',
        _type: 'system.release',
        name: 'r1',
        state: 'active',
        metadata: {releaseType: 'asap'},
      } as ReleaseDocument,
    ])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.getCurrent()).toHaveLength(1)

    const [, options] = vi.mocked(observeReleases).mock.lastCall!
    const corsError = new Error('CORS misconfiguration')
    options.onCorsError(corsError)
    await new Promise((resolve) => setTimeout(resolve, 0))

    // the CORS error is recorded as store state so the releases selector
    // rethrows it (handled by the Cors Error component)
    expect(() => state.getCurrent()).toThrow(corsError)
  })

  it('should surface the error when the releases query errors', async () => {
    const subject = new Subject<ReleaseDocument[]>()
    vi.mocked(observeReleases).mockReturnValue(subject.asObservable())

    const active = getActiveReleasesState(instance, {
      resource: {projectId: 'test', dataset: 'test'},
    })
    const all = getAllReleasesState(instance, {resource: {projectId: 'test', dataset: 'test'}})

    const error = new Error('Query failed')
    subject.error(error)

    await new Promise((resolve) => setTimeout(resolve, 0))

    // The error must be surfaced (thrown) rather than silently swallowed,
    // otherwise consumers just see an empty list with no signal.
    expect(() => active.getCurrent()).toThrow(error)
    expect(() => all.getCurrent()).toThrow(error)
  })
})
