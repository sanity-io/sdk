import {getProjectState, type ProjectHandle, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {ResourceProvider} from '../../context/ResourceProvider'
import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {useProject} from './useProject'

// Hoisted mock reference so we can control useProjectValue's behavior in tests
const mockUseProjectValue = vi.hoisted(() => vi.fn())

// Mock dependencies
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getProjectState: vi.fn(() => ({
      getCurrent: vi.fn(() => undefined),
    })),
    resolveProject: vi.fn(),
  }
})
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(() => mockUseProjectValue),
}))
// vi.mock('../helpers/useNormalizedResourceOptions', () => ({
//   useNormalizedResourceOptions: vi.fn(),
// }))

const mockProject = {
  id: 'test-project',
  displayName: 'Test Project',
  studioHost: null,
  organizationId: null,
  isBlocked: false,
  isDisabled: false,
  isDisabledByUser: false,
  createdAt: '2025-01-01T00:00:00Z',
  members: [],
  metadata: {},
  maxRetentionDays: 30,
  pendingInvites: 0,
}

describe('useProjectValue (module initialization)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mock('@sanity/sdk', async (importOriginal) => {
      const original = await importOriginal<typeof import('@sanity/sdk')>()
      return {
        ...original,
        getProjectState: vi.fn(() => ({
          getCurrent: vi.fn(() => undefined),
        })),
        resolveProject: vi.fn(),
      }
    })
    vi.mock('../helpers/createStateSourceHook', () => ({
      createStateSourceHook: vi.fn(() => mockUseProjectValue),
    }))
  })

  it('should call createStateSourceHook with correct arguments on import', async () => {
    await import('./useProject')

    expect(createStateSourceHook).toHaveBeenCalled()
    expect(createStateSourceHook).toHaveBeenCalledWith(
      expect.objectContaining({
        getState: expect.any(Function),
        shouldSuspend: expect.any(Function),
        suspender: expect.any(Function),
      }),
    )
  })

  it('shouldSuspend should call getProjectState and getCurrent', async () => {
    await import('./useProject')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook.mock.calls.length).toBeGreaterThan(0)
    const createStateSourceHookArgs = mockCreateStateSourceHook.mock.calls[0][0]
    const shouldSuspend = createStateSourceHookArgs.shouldSuspend

    const mockInstance = {} as SanityInstance
    const mockProjectHandle = {} as ProjectHandle

    const result = shouldSuspend(mockInstance, mockProjectHandle)

    const mockGetProjectState = getProjectState as ReturnType<typeof vi.fn>
    expect(mockGetProjectState).toHaveBeenCalledWith(mockInstance, mockProjectHandle)

    expect(mockGetProjectState.mock.results.length).toBeGreaterThan(0)
    const getProjectStateMockResult = mockGetProjectState.mock.results[0].value
    expect(getProjectStateMockResult.getCurrent).toHaveBeenCalled()

    expect(result).toBe(true) // Since getCurrent is mocked to return undefined
  })
})

describe('useProject', () => {
  beforeEach(() => {
    vi.mocked(mockUseProjectValue).mockReturnValue(mockProject)
  })

  it('uses projectHandle.projectId directly when provided', () => {
    const {result} = renderHook(() => useProject({projectId: 'direct-project-id'}))

    expect(mockUseProjectValue).toHaveBeenCalledWith({projectId: 'direct-project-id'})
    expect(result.current).toBe(mockProject)
  })

  it('extracts projectId from context DatasetResource when no projectHandle is given', () => {
    const {result} = renderHook(() => useProject())

    // from ResourceProvider in test-utils
    expect(mockUseProjectValue).toHaveBeenCalledWith({projectId: 'test'})
    expect(result.current).toBe(mockProject)
  })

  it('prefers projectHandle.projectId over the projectId in the context resource', () => {
    renderHook(() => useProject({projectId: 'explicit-project-id'}))

    expect(mockUseProjectValue).toHaveBeenCalledWith({projectId: 'explicit-project-id'})
  })

  it('throws when no projectHandle is given and context resource is not a DatasetResource', () => {
    const {result} = renderHook(
      () => {
        try {
          return useProject()
        } catch (e) {
          return e
        }
      },
      {
        wrapper: ({children}) => (
          <ResourceProvider resource={{mediaLibraryId: 'media-library-id'}} fallback={null}>
            {children}
          </ResourceProvider>
        ),
      },
    )

    expect(result.current).toBeInstanceOf(Error)
    expect((result.current as Error).message).toMatch(
      /Pass a resource that is a dataset resource, or a project handle with a projectId/,
    )
  })
})
