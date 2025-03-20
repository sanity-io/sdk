import {
  type DocumentAction,
  getPermissionsState,
  type PermissionsResult,
  type SanityInstance,
} from '@sanity/sdk'
import {act, renderHook, waitFor} from '@testing-library/react'
import {BehaviorSubject, firstValueFrom} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {usePermissions} from './usePermissions'

// Mock dependencies before any imports
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

vi.mock('@sanity/sdk', () => ({
  getPermissionsState: vi.fn(),
}))

// Move this mock to the top level
vi.mock('rxjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('rxjs')>()
  return {
    ...actual,
    firstValueFrom: vi.fn().mockImplementation(() => Promise.resolve()),
  }
})

describe('usePermissions', () => {
  const mockInstance = {id: 'mock-instance'} as unknown as SanityInstance
  const mockAction: DocumentAction = {
    type: 'document.publish',
    documentId: 'doc1',
    documentType: 'article',
    projectId: 'project1',
    dataset: 'dataset1',
  }

  const mockPermissionAllowed: PermissionsResult = {allowed: true}
  const mockPermissionDenied: PermissionsResult = {
    allowed: false,
    message: 'Permission denied for document.publish',
    reasons: [
      {
        type: 'access',
        message: 'You do not have permission to publish this document',
        documentId: 'doc1',
      },
    ],
  }

  let permissionsSubject: BehaviorSubject<PermissionsResult | undefined>
  let mockSubscribe: ReturnType<typeof vi.fn>
  let mockGetCurrent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    // Create a subject to simulate permissions state updates
    permissionsSubject = new BehaviorSubject<PermissionsResult | undefined>(mockPermissionAllowed)

    mockSubscribe = vi.fn((callback) => {
      // Set up subscription to our subject
      const subscription = permissionsSubject.subscribe(callback)
      // Return an unsubscribe function
      return () => subscription.unsubscribe()
    })

    mockGetCurrent = vi.fn(() => permissionsSubject.getValue())

    // Set up the getPermissionsState mock
    vi.mocked(getPermissionsState).mockReturnValue({
      observable: permissionsSubject.asObservable(),
      subscribe: mockSubscribe,
      getCurrent: mockGetCurrent,
    })
  })

  afterEach(() => {
    permissionsSubject.complete()
  })

  it('should return permissions result from getPermissionsState', () => {
    // Initialize with permission allowed
    act(() => {
      permissionsSubject.next(mockPermissionAllowed)
    })

    const {result} = renderHook(() => usePermissions(mockAction))

    expect(useSanityInstance).toHaveBeenCalledWith({
      projectId: mockAction.projectId,
      dataset: mockAction.dataset,
    })
    expect(getPermissionsState).toHaveBeenCalledWith(mockInstance, mockAction)
    expect(result.current).toEqual(mockPermissionAllowed)
  })

  it('should handle permission denied state', () => {
    // Initialize with permission denied
    act(() => {
      permissionsSubject.next(mockPermissionDenied)
    })

    const {result} = renderHook(() => usePermissions(mockAction))

    expect(result.current).toEqual(mockPermissionDenied)
    expect(result.current.allowed).toBe(false)
    expect(result.current.message).toBe('Permission denied for document.publish')
    expect(result.current.reasons).toHaveLength(1)
  })

  it('should accept an array of actions', () => {
    const actions = [mockAction, {...mockAction, documentId: 'doc2'}]

    renderHook(() => usePermissions(actions))

    expect(getPermissionsState).toHaveBeenCalledWith(mockInstance, actions)
  })

  it('should throw an error if actions have mismatched project IDs', () => {
    const actions = [
      mockAction,
      {...mockAction, projectId: 'different-project', documentId: 'doc2'},
    ]

    expect(() => {
      renderHook(() => usePermissions(actions))
    }).toThrow(/Mismatched project IDs found in actions/)
  })

  it('should throw an error if actions have mismatched datasets', () => {
    const actions = [mockAction, {...mockAction, dataset: 'different-dataset', documentId: 'doc2'}]

    expect(() => {
      renderHook(() => usePermissions(actions))
    }).toThrow(/Mismatched datasets found in actions/)
  })

  it('should wait for permissions to be ready before rendering', async () => {
    // Set up initial value as undefined (not ready)
    act(() => {
      permissionsSubject.next(undefined)
    })

    // Setup a resolved promise for firstValueFrom
    const mockPromise = Promise.resolve(mockPermissionAllowed)
    vi.mocked(firstValueFrom).mockReturnValueOnce(mockPromise)

    // This should throw the promise and suspend
    const {result} = renderHook(() => {
      try {
        return usePermissions(mockAction)
      } catch (error) {
        if (error instanceof Promise) {
          return 'suspended'
        }
        throw error
      }
    })

    expect(result.current).toBe('suspended')

    // Resolve the promise by setting a value
    act(() => {
      permissionsSubject.next(mockPermissionAllowed)
    })

    // Now it should render properly
    await waitFor(() => {
      expect(getPermissionsState).toHaveBeenCalledWith(mockInstance, mockAction)
    })
  })

  it('should react to permission state changes', async () => {
    // Start with permission allowed
    act(() => {
      permissionsSubject.next(mockPermissionAllowed)
    })

    const {result, rerender} = renderHook(() => usePermissions(mockAction))

    expect(result.current).toEqual(mockPermissionAllowed)

    // Change to permission denied
    act(() => {
      permissionsSubject.next(mockPermissionDenied)
    })

    // Rerender to trigger the update
    rerender()

    await waitFor(() => {
      expect(result.current).toEqual(mockPermissionDenied)
    })
  })
})
