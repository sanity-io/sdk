import {filter, firstValueFrom, of, Subject, take} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {type PerspectiveHandle, type ReleasePerspective} from '../config/sanityConfig'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {listenQuery as mockListenQuery} from '../utils/listenQuery'
import {getPerspectiveState} from './getPerspectiveState'
import {type ReleaseDocument} from './releasesStore'

vi.mock('../utils/listenQuery', () => ({
  listenQuery: vi.fn(),
}))

vi.mock('../client/clientStore', () => ({
  getClientState: vi.fn(() => ({
    observable: of({}),
    getCurrent: vi.fn(),
    subscribe: vi.fn(),
  })),
}))

describe('getPerspectiveState', () => {
  let instance: SanityInstance
  let mockReleasesQuerySubject: Subject<ReleaseDocument[]>

  const release1 = {
    _id: 'release-1',
    _type: 'sanity.release',
    name: 'release1',
    metadata: {title: 'Release 1', releaseType: 'asap'},
    status: 'active',
  } as unknown as ReleaseDocument
  const release2: ReleaseDocument = {
    ...release1,
    _id: 'release-2',
    _rev: 'rev2',
    name: 'release2',
    metadata: {title: 'Release 2', releaseType: 'asap'},
  }

  // the release store is reversed in getActiveReleases to match UI elsewhere
  const activeReleases = [release2, release1]

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    mockReleasesQuerySubject = new Subject<ReleaseDocument[]>()
    vi.mocked(mockListenQuery).mockReturnValue(mockReleasesQuerySubject.asObservable())
  })

  afterEach(() => {
    instance.dispose()
    vi.clearAllMocks()
  })

  it('should return default perspective if no options or instance perspective is provided', async () => {
    const state = getPerspectiveState(instance)
    mockReleasesQuerySubject.next([])
    const perspective = await firstValueFrom(state.observable)
    expect(perspective).toBe('drafts')
  })

  it('should return instance perspective if provided and no options perspective', async () => {
    instance.config.perspective = 'published'
    const state = getPerspectiveState(instance)
    mockReleasesQuerySubject.next([])
    const perspective = await firstValueFrom(state.observable)
    expect(perspective).toBe('published')
  })

  it('should return options perspective if provided', async () => {
    const options: PerspectiveHandle = {perspective: 'raw'}
    const state = getPerspectiveState(instance, options)
    mockReleasesQuerySubject.next([])
    const perspective = await firstValueFrom(state.observable)
    expect(perspective).toBe('raw')
  })

  it('should return undefined if release perspective is requested but no active releases', async () => {
    const options: PerspectiveHandle = {perspective: {releaseName: 'release1'}}
    const state = getPerspectiveState(instance, options)
    mockReleasesQuerySubject.next([])
    const perspective = await firstValueFrom(state.observable)
    expect(perspective).toBeUndefined()
  })

  it('should calculate perspective based on active releases and releaseName', async () => {
    const options: PerspectiveHandle = {perspective: {releaseName: 'release1'}}
    const state = getPerspectiveState(instance, options)
    mockReleasesQuerySubject.next(activeReleases)

    const perspective = await firstValueFrom(
      state.observable.pipe(
        filter((p): p is NonNullable<typeof p> => p !== undefined),
        take(1),
      ),
    )
    expect(perspective).toEqual(['drafts', 'release1'])
  })

  it('should calculate perspective including multiple releases up to the specified releaseName', async () => {
    const options: PerspectiveHandle = {perspective: {releaseName: 'release2'}}
    const state = getPerspectiveState(instance, options)
    mockReleasesQuerySubject.next(activeReleases)
    const perspective = await firstValueFrom(
      state.observable.pipe(
        filter((p): p is NonNullable<typeof p> => p !== undefined),
        take(1),
      ),
    )
    expect(perspective).toEqual(['drafts', 'release1', 'release2'])
  })

  it('should filter excluded perspectives', async () => {
    const perspectiveConfig: ReleasePerspective = {
      releaseName: 'release2',
      excludedPerspectives: ['drafts', 'release1'],
    }
    const options: PerspectiveHandle = {perspective: perspectiveConfig}
    const state = getPerspectiveState(instance, options)
    mockReleasesQuerySubject.next(activeReleases)
    const perspective = await firstValueFrom(
      state.observable.pipe(
        filter((p): p is NonNullable<typeof p> => p !== undefined),
        take(1),
      ),
    )
    expect(perspective).toEqual(['release2'])
  })

  it('should throw if the specified releaseName is not found in active releases', async () => {
    const options: PerspectiveHandle = {perspective: {releaseName: 'nonexistent'}}
    const state = getPerspectiveState(instance, options)
    mockReleasesQuerySubject.next(activeReleases)

    await expect(
      firstValueFrom(
        state.observable.pipe(
          filter((p): p is NonNullable<typeof p> => p !== undefined),
          take(1),
        ),
      ),
    ).rejects.toThrow('Release "nonexistent" not found in active releases')
  })

  it('should reuse the same options object for identical inputs (cache test)', async () => {
    const options1: PerspectiveHandle = {perspective: {releaseName: 'release1'}}
    const options2: PerspectiveHandle = {perspective: {releaseName: 'release1'}}

    const state1 = getPerspectiveState(instance, options1)
    mockReleasesQuerySubject.next(activeReleases)
    await firstValueFrom(
      state1.observable.pipe(
        filter((p): p is NonNullable<typeof p> => p !== undefined),
        take(1),
      ),
    )

    const state2 = getPerspectiveState(instance, options2)
    const perspective2 = state2.getCurrent()

    expect(perspective2).toEqual(['drafts', 'release1'])
  })

  it('should handle changes in activeReleases (cache test)', async () => {
    const options: PerspectiveHandle = {perspective: {releaseName: 'release1'}}

    const state1 = getPerspectiveState(instance, options)
    mockReleasesQuerySubject.next(activeReleases)
    const perspective1 = await firstValueFrom(
      state1.observable.pipe(
        filter((p): p is NonNullable<typeof p> => p !== undefined),
        take(1),
      ),
    )
    expect(perspective1).toEqual(['drafts', 'release1'])

    const updatedActiveReleases = [release1]
    mockReleasesQuerySubject.next(updatedActiveReleases)

    const perspectiveAfterUpdate = await firstValueFrom(
      state1.observable.pipe(
        filter((p): p is NonNullable<typeof p> => p !== undefined),
        take(1),
      ),
    )
    expect(perspectiveAfterUpdate).toEqual(['drafts', 'release1'])

    const state2 = getPerspectiveState(instance, options)
    const perspectiveNewCall = state2.getCurrent()
    expect(perspectiveNewCall).toEqual(['drafts', 'release1'])
  })
})
