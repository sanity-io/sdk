import {observeOrganizationVerificationState, type OrgVerificationResult} from '@sanity/sdk'
import {act, renderHook, waitFor} from '@testing-library/react'
import {Subject} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useVerifyOrgProjects} from './useVerifyOrgProjects'

// Mock dependencies
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    observeOrganizationVerificationState: vi.fn(),
  }
})
vi.mock('../context/useSanityInstance')

describe('useVerifyOrgProjects', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockInstance = {config: {}} as any // Dummy instance
  const mockObserve = vi.mocked(observeOrganizationVerificationState)
  const mockUseInstance = vi.mocked(useSanityInstance)

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInstance.mockReturnValue(mockInstance)
  })

  it('should return null and not observe state if disabled', () => {
    const {result} = renderHook(() => useVerifyOrgProjects(true))

    expect(result.current).toBeNull()
    expect(mockObserve).not.toHaveBeenCalled()
  })

  it('should return null initially when not disabled', () => {
    const subject = new Subject<OrgVerificationResult>()
    mockObserve.mockReturnValue(subject.asObservable())

    const {result} = renderHook(() => useVerifyOrgProjects(false))

    expect(result.current).toBeNull()
    expect(mockObserve).toHaveBeenCalledWith(mockInstance)
  })

  it('should return null if observable emits { error: null }', async () => {
    const subject = new Subject<OrgVerificationResult>()
    mockObserve.mockReturnValue(subject.asObservable())

    const {result} = renderHook(() => useVerifyOrgProjects(false))

    act(() => {
      subject.next({error: null})
    })

    await waitFor(() => {
      expect(result.current).toBeNull()
    })
  })

  it('should return error string if observable emits { error: string }', async () => {
    const subject = new Subject<OrgVerificationResult>()
    const errorMessage = 'Org mismatch'
    mockObserve.mockReturnValue(subject.asObservable())

    const {result} = renderHook(() => useVerifyOrgProjects(false))

    act(() => {
      subject.next({error: errorMessage})
    })

    await waitFor(() => {
      expect(result.current).toBe(errorMessage)
    })
  })

  it('should unsubscribe on unmount', () => {
    const subject = new Subject<OrgVerificationResult>()
    const unsubscribeSpy = vi.spyOn(subject, 'unsubscribe')
    mockObserve.mockReturnValue(subject)

    const {unmount} = renderHook(() => useVerifyOrgProjects(false))

    expect(unsubscribeSpy).not.toHaveBeenCalled()
    unmount()
    // Note: RxJS handles the inner subscription cleanup when the source (Subject) completes or errors,
    // but testing library unmount should trigger the useEffect cleanup which calls unsubscribe.
    // However, the spy might be on the Subject itself, not the final Subscription object.
    // Let's adjust to spy on the returned subscription directly if possible, or accept this limitation.
    // For now, we assume the useEffect cleanup calls unsubscribe correctly.
    // We can validate subscription logic more deeply if needed.
    // For this test, let's check if the observable reference still has observers.
    expect(subject.observed).toBe(false) // Check if observers are gone after unmount
  })

  it('should clear the error if disabled becomes true', async () => {
    const subject = new Subject<OrgVerificationResult>()
    const errorMessage = 'Org mismatch'
    mockObserve.mockReturnValue(subject.asObservable())

    const {result, rerender} = renderHook(({disabled}) => useVerifyOrgProjects(disabled), {
      initialProps: {disabled: false},
    })

    // Set initial error
    act(() => {
      subject.next({error: errorMessage})
    })
    await waitFor(() => {
      expect(result.current).toBe(errorMessage)
    })

    // Disable the hook
    rerender({disabled: true})

    // Error should be cleared
    await waitFor(() => {
      expect(result.current).toBeNull()
    })
  })
})
