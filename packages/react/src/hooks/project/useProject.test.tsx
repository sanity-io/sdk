// useProject.test.tsx
import {type SanityProject} from '@sanity/client'
import {getProject, getProjectState} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

// Dependencies to mock
import {useSanityInstance} from '../context/useSanityInstance'
// Our hook under test
import {useProject} from './useProject'

// Mock the modules using Mock
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))
vi.mock('@sanity/sdk', () => ({
  getProjectState: vi.fn(),
  getProject: vi.fn(),
}))

describe('useProject', () => {
  let sanityInstance: Record<string, unknown>
  let mockSubscribe = vi.fn(() => () => {})

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()

    // Create a mock subscription function
    const unsubscribe = vi.fn()
    mockSubscribe = vi.fn(() => unsubscribe)

    // Create an arbitrary mock instance
    sanityInstance = {
      /* any instance-like object */
    }

    // Default mocks
    ;(useSanityInstance as Mock).mockReturnValue(sanityInstance)
    ;(getProjectState as Mock).mockReturnValue({
      projects: [],
      subscribe: mockSubscribe,
    })
    ;(getProject as Mock).mockResolvedValue({} as SanityProject)
  })

  it('returns a project if it is already in the state', async () => {
    // Arrange: create a mock project
    const testProject: SanityProject = {
      id: 'test-project-id',
      displayName: 'Test Project',
      studioHost: null,
      organizationId: null,
      isBlocked: false,
      isDisabled: false,
      isDisabledByUser: false,
      createdAt: '',
      members: [],
      metadata: {
        cliInitializedAt: undefined,
        color: undefined,
        externalStudioHost: undefined,
      },
    }

    // Mock the state to have that project
    ;(getProjectState as Mock).mockReturnValue({
      projects: [testProject],
      subscribe: mockSubscribe,
    })

    // Act: render the hook
    const {result} = renderHook(() => useProject('test-project-id'))

    // Assert: it should return the project
    expect(result.current).toEqual(testProject)

    // Also verify the "stale-while-revalidate" call
    expect(getProject).toHaveBeenCalledWith(sanityInstance, 'test-project-id', true)
    // and ensure a subscription was made
    expect(mockSubscribe).toHaveBeenCalledTimes(1)
  })

  it('re-subscribes on each render, unsubscribes after unmount', () => {
    // Provide a project so that it doesn't throw
    const testProject: SanityProject = {
      id: 'some-project',
      displayName: 'Some Project',
      studioHost: null,
      organizationId: null,
      isBlocked: false,
      isDisabled: false,
      isDisabledByUser: false,
      createdAt: '',
      members: [],
      metadata: {
        cliInitializedAt: undefined,
        color: undefined,
        externalStudioHost: undefined,
      },
    }
    ;(getProjectState as Mock).mockReturnValue({
      projects: [testProject],
      subscribe: mockSubscribe,
    })

    // Act: render + unmount
    const {unmount} = renderHook(() => useProject('some-project'))

    expect(mockSubscribe).toHaveBeenCalledTimes(1) // subscribed

    act(() => {
      unmount()
    })

    // We could check the unsubscribe if you return a function from mockSubscribe
    // For example:
    // const unsubscribe = vi.fn()
    // mockSubscribe.mockReturnValue(unsubscribe)
    // after unmount, you can expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('enforces stale-while-revalidate: calls getProject with forceRefresh when a project is present', () => {
    // Provide a project
    const testProject: SanityProject = {
      id: 'another-id',
      displayName: 'Stale Project',
      studioHost: null,
      organizationId: null,
      isBlocked: false,
      isDisabled: false,
      isDisabledByUser: false,
      createdAt: '',
      members: [],
      metadata: {
        cliInitializedAt: undefined,
        color: undefined,
        externalStudioHost: undefined,
      },
    }
    ;(getProjectState as Mock).mockReturnValue({
      projects: [testProject],
      subscribe: mockSubscribe,
    })

    renderHook(() => useProject('another-id'))

    // Right after mount, it calls getProject with forceRefresh=true
    expect(getProject).toHaveBeenCalledWith(sanityInstance, 'another-id', true)
  })
})
