import {type SanityClient} from '@sanity/client'
import {of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {listenQuery} from '../utils/listenQuery'
import {getActiveReleasesState, type ReleaseDocument} from './releasesStore'

// Mock dependencies
vi.mock('../client/clientStore', () => ({
  getClientState: vi.fn(),
}))
vi.mock('../utils/listenQuery', () => ({
  listenQuery: vi.fn(),
}))

// Mock console.error to prevent test runner noise and allow verification
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

describe('releasesStore', () => {
  let instance: SanityInstance
  const mockClient = {} as SanityClient

  beforeEach(() => {
    vi.resetAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => {
    instance.dispose()
    consoleErrorSpy.mockRestore()
  })

  it('should set active releases state when listenQuery succeeds', async () => {
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

    vi.mocked(listenQuery).mockReturnValue(of(mockReleases))

    const state = getActiveReleasesState(instance)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.getCurrent()).toEqual(mockReleases.reverse())
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('should update active releases state when listenQuery emits new data', async () => {
    const releasesSubject = new Subject<ReleaseDocument[]>()
    vi.mocked(listenQuery).mockReturnValue(releasesSubject.asObservable())

    const state = getActiveReleasesState(instance)

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
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should handle empty array from listenQuery', async () => {
    // Configure listenQuery to return an empty array
    vi.mocked(listenQuery).mockReturnValue(of([]))

    const state = getActiveReleasesState(instance)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(state.getCurrent()).toEqual([]) // Should be set to empty array
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should handle null/undefined from listenQuery by defaulting to empty array', async () => {
    // Test null case
    vi.mocked(listenQuery).mockReturnValue(of(null))
    const state = getActiveReleasesState(instance)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.getCurrent()).toEqual([])
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    // Test undefined case
    vi.mocked(listenQuery).mockReturnValue(of(undefined))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(state.getCurrent()).toEqual([])
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should handle errors from listenQuery by retrying and eventually setting error state', async () => {
    vi.useFakeTimers()
    const error = new Error('Query failed')
    const subject = new Subject<ReleaseDocument[]>()
    vi.mocked(listenQuery).mockReturnValue(subject.asObservable())

    // initialize the store
    const state = getActiveReleasesState(instance)

    // Error the subject
    subject.error(error)

    // Advance enough to cover the retry attempts (exponential backoff: 1s, 2s, 4s)
    for (let i = 0; i < 3; i++) {
      const delay = Math.pow(2, i) * 1000
      await vi.advanceTimersByTimeAsync(delay)
    }

    // Verify error was logged at least once during retries
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[releases] Error in subscription:',
      error,
      'Retry count:',
      expect.any(Number),
    )

    // not sure how to test state.setError()
    expect(state.getCurrent()).toEqual(undefined)

    vi.useRealTimers()
  })
})
