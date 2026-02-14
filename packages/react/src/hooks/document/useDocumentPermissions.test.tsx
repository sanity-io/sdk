import {type DocumentAction, type DocumentPermissionsResult, getPermissionsState} from '@sanity/sdk'
import {act, renderHook, waitFor} from '@testing-library/react'
import {BehaviorSubject, firstValueFrom, Observable} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useDocumentPermissions} from './useDocumentPermissions'

vi.mock('@sanity/sdk', async (importActual) => {
  const actual = await importActual<typeof import('@sanity/sdk')>()
  return {
    ...actual,
    getPermissionsState: vi.fn(),
  }
})

// Move this mock to the top level
vi.mock('rxjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('rxjs')>()
  return {
    ...actual,
    firstValueFrom: vi.fn().mockImplementation(() => Promise.resolve()),
  }
})

describe('usePermissions', () => {
  const mockAction: DocumentAction = {
    type: 'document.publish',
    documentId: 'doc1',
    documentType: 'article',
    projectId: 'project1',
    dataset: 'dataset1',
  }

  const mockPermissionAllowed: DocumentPermissionsResult = {allowed: true}
  const mockPermissionDenied: DocumentPermissionsResult = {
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

  let permissionsSubject: BehaviorSubject<DocumentPermissionsResult | undefined>
  let mockSubscribe: ReturnType<typeof vi.fn>
  let mockGetCurrent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    // Create a subject to simulate permissions state updates
    permissionsSubject = new BehaviorSubject<DocumentPermissionsResult | undefined>(
      mockPermissionAllowed,
    )

    mockSubscribe = vi.fn((callback) => {
      // Set up subscription to our subject
      const subscription = permissionsSubject.subscribe(callback)
      // Return an unsubscribe function
      return () => subscription.unsubscribe()
    })

    mockGetCurrent = vi.fn(() => permissionsSubject.getValue())

    // Set up the getPermissionsState mock
    vi.mocked(getPermissionsState).mockReturnValue({
      observable:
        permissionsSubject.asObservable() as unknown as Observable<DocumentPermissionsResult>,
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

    const {result} = renderHook(() => useDocumentPermissions(mockAction), {
      wrapper: ({children}) => (
        <ResourceProvider
          projectId={mockAction.projectId}
          dataset={mockAction.dataset}
          fallback={null}
        >
          {children}
        </ResourceProvider>
      ),
    })

    // ResourceProvider handles the instance configuration
    expect(getPermissionsState).toHaveBeenCalledWith(expect.any(Object), {actions: [mockAction]})
    expect(result.current).toEqual(mockPermissionAllowed)
  })

  it('should handle permission denied state', () => {
    // Initialize with permission denied
    act(() => {
      permissionsSubject.next(mockPermissionDenied)
    })

    const {result} = renderHook(() => useDocumentPermissions(mockAction), {
      wrapper: ({children}) => (
        <ResourceProvider
          projectId={mockAction.projectId}
          dataset={mockAction.dataset}
          fallback={null}
        >
          {children}
        </ResourceProvider>
      ),
    })

    expect(result.current).toEqual(mockPermissionDenied)
    expect(result.current.allowed).toBe(false)
    expect(result.current.message).toBe('Permission denied for document.publish')
    expect(result.current.reasons).toHaveLength(1)
  })

  it('should accept an array of actions', () => {
    const actions = [mockAction, {...mockAction, documentId: 'doc2'}]

    renderHook(() => useDocumentPermissions(actions), {
      wrapper: ({children}) => (
        <ResourceProvider
          projectId={mockAction.projectId}
          dataset={mockAction.dataset}
          fallback={null}
        >
          {children}
        </ResourceProvider>
      ),
    })

    expect(getPermissionsState).toHaveBeenCalledWith(expect.any(Object), {actions})
  })

  it('should throw an error if actions have mismatched project IDs', () => {
    const actions = [
      mockAction,
      {...mockAction, projectId: 'different-project', documentId: 'doc2'},
    ]

    expect(() => {
      renderHook(() => useDocumentPermissions(actions), {
        wrapper: ({children}) => (
          <ResourceProvider
            projectId={mockAction.projectId}
            dataset={mockAction.dataset}
            fallback={null}
          >
            {children}
          </ResourceProvider>
        ),
      })
    }).toThrow(/Mismatched project IDs found in actions/)
  })

  it('should throw an error if actions have mismatched datasets', () => {
    const actions = [mockAction, {...mockAction, dataset: 'different-dataset', documentId: 'doc2'}]

    expect(() => {
      renderHook(() => useDocumentPermissions(actions), {
        wrapper: ({children}) => (
          <ResourceProvider
            projectId={mockAction.projectId}
            dataset={mockAction.dataset}
            fallback={null}
          >
            {children}
          </ResourceProvider>
        ),
      })
    }).toThrow(/Mismatched datasets found in actions/)
  })

  it('should throw an error if actions have mismatched sources', () => {
    const actions = [
      {
        type: 'document.publish' as const,
        documentId: 'doc1',
        documentType: 'article',
        source: {projectId: 'p1', dataset: 'd1'},
      },
      {
        type: 'document.publish' as const,
        documentId: 'doc2',
        documentType: 'article',
        source: {projectId: 'p2', dataset: 'd2'},
      },
    ]

    expect(() => {
      renderHook(() => useDocumentPermissions(actions), {
        wrapper: ({children}) => (
          <ResourceProvider
            projectId={mockAction.projectId}
            dataset={mockAction.dataset}
            fallback={null}
          >
            {children}
          </ResourceProvider>
        ),
      })
    }).toThrow(/Mismatched sources found in actions/)
  })

  it('should throw an error when mixing projectId and source (projectId first)', () => {
    const actions = [
      mockAction,
      {
        type: 'document.publish' as const,
        documentId: 'doc2',
        documentType: 'article',
        source: {projectId: 'p', dataset: 'd'},
      },
    ]

    expect(() => {
      renderHook(() => useDocumentPermissions(actions), {
        wrapper: ({children}) => (
          <ResourceProvider
            projectId={mockAction.projectId}
            dataset={mockAction.dataset}
            fallback={null}
          >
            {children}
          </ResourceProvider>
        ),
      })
    }).toThrow(/Mismatches between projectId\/dataset options and source/)
  })

  it('should throw an error when mixing source and projectId (source first)', () => {
    const actions = [
      {
        type: 'document.publish' as const,
        documentId: 'doc1',
        documentType: 'article',
        source: {projectId: 'p', dataset: 'd'},
      },
      mockAction,
    ]

    expect(() => {
      renderHook(() => useDocumentPermissions(actions), {
        wrapper: ({children}) => (
          <ResourceProvider
            projectId={mockAction.projectId}
            dataset={mockAction.dataset}
            fallback={null}
          >
            {children}
          </ResourceProvider>
        ),
      })
    }).toThrow(/Mismatches between projectId\/dataset options and source/)
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
    const {result} = renderHook(
      () => {
        try {
          return useDocumentPermissions(mockAction)
        } catch (error) {
          if (error instanceof Promise) {
            return 'suspended'
          }
          throw error
        }
      },
      {
        wrapper: ({children}) => (
          <ResourceProvider
            projectId={mockAction.projectId}
            dataset={mockAction.dataset}
            fallback={null}
          >
            {children}
          </ResourceProvider>
        ),
      },
    )

    expect(result.current).toBe('suspended')

    // Resolve the promise by setting a value
    act(() => {
      permissionsSubject.next(mockPermissionAllowed)
    })

    // Now it should render properly
    await waitFor(() => {
      expect(getPermissionsState).toHaveBeenCalledWith(expect.any(Object), {actions: [mockAction]})
    })
  })

  it('should react to permission state changes', async () => {
    // Start with permission allowed
    act(() => {
      permissionsSubject.next(mockPermissionAllowed)
    })

    const {result, rerender} = renderHook(() => useDocumentPermissions(mockAction), {
      wrapper: ({children}) => (
        <ResourceProvider
          projectId={mockAction.projectId}
          dataset={mockAction.dataset}
          fallback={null}
        >
          {children}
        </ResourceProvider>
      ),
    })

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
