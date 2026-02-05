import {NEVER, Observable, type Observer, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getQueryState, resolveQuery} from '../query/queryStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getActiveReleasesState, type ReleaseDocument} from './releasesStore'

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

    const state = getActiveReleasesState(instance, {source: {projectId: 'test', dataset: 'test'}})

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

    const state = getActiveReleasesState(instance, {source: {projectId: 'test', dataset: 'test'}})

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

    const state = getActiveReleasesState(instance, {source: {projectId: 'test', dataset: 'test'}})

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
    const state = getActiveReleasesState(instance, {source: {projectId: 'test', dataset: 'test'}})
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

  it('should not crash when the releases query errors', async () => {
    const subject = new Subject<ReleaseDocument[]>()
    vi.mocked(getQueryState).mockReturnValue({
      subscribe: () => () => {},
      getCurrent: () => undefined,
      observable: subject.asObservable(),
    } as StateSource<ReleaseDocument[] | undefined>)

    const state = getActiveReleasesState(instance, {source: {projectId: 'test', dataset: 'test'}})

    subject.error(new Error('Query failed'))

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.getCurrent()).toEqual(undefined)
  })
})
