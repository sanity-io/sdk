import {AuthStateType, type SanityConfig} from '@sanity/sdk'
import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {SanityApp} from './SanityApp'
import {SDKProvider} from './SDKProvider'

// Mock SDKProvider to verify it's being used correctly
vi.mock('./SDKProvider', () => ({
  SDKProvider: vi.fn(() => <div data-testid="sdk-provider">SDKProvider</div>),
}))

// Mock useEffect to prevent redirect logic from running in tests
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    createSanityInstance: vi.fn(() => ({
      config: {},
      auth: {
        getSession: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      },
      identity: {
        projectId: 'test-project',
        dataset: 'test-dataset',
      },
      dispose: vi.fn(),
    })),
  }
})

vi.mock('../hooks/auth/useAuthState', () => ({
  useAuthState: () => ({
    type: AuthStateType.LOGGED_IN,
    session: {
      user: {
        id: 'test-user',
      },
    },
  }),
}))

describe('SanityApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders SDKProvider with a single config', () => {
    const singleConfig = {
      projectId: 'test-project',
      dataset: 'production',
    }

    render(
      <SanityApp config={singleConfig} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SanityApp>,
    )

    // Check that the SDKProvider is rendered
    expect(screen.getByTestId('sdk-provider')).toBeInTheDocument()

    // Verify SDKProvider was called with the correct props
    const sdkProviderCalls = vi.mocked(SDKProvider).mock.calls
    expect(sdkProviderCalls.length).toBe(1)

    const [props] = sdkProviderCalls[0]
    const {config} = props

    // Config is now passed directly as an object for single configs
    expect(config).toEqual(singleConfig)
    expect(props.fallback).toBeTruthy()
  })

  it('renders SDKProvider with multiple configs in original order', () => {
    const multipleConfigs = [
      {
        projectId: 'project-1',
        dataset: 'production',
      },
      {
        projectId: 'project-2',
        dataset: 'staging',
      },
      {
        projectId: 'project-3',
        dataset: 'development',
      },
    ]

    render(
      <SanityApp config={multipleConfigs} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SanityApp>,
    )

    // Check that the SDKProvider is rendered
    expect(screen.getByTestId('sdk-provider')).toBeInTheDocument()

    // Verify SDKProvider was called with the correct props
    const sdkProviderCalls = vi.mocked(SDKProvider).mock.calls
    expect(sdkProviderCalls.length).toBe(1)

    const [props] = sdkProviderCalls[0]
    const {config} = props

    // Config should be passed directly to SDKProvider
    expect(config).toEqual(multipleConfigs)
  })

  it('supports legacy sanityConfigs prop', () => {
    const legacyConfigs = [
      {
        projectId: 'legacy-project-1',
        dataset: 'production',
      },
      {
        projectId: 'legacy-project-2',
        dataset: 'staging',
      },
    ]

    render(
      // @ts-expect-error purposefully using the deprecated prop
      <SanityApp sanityConfigs={legacyConfigs} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SanityApp>,
    )

    // Check that the SDKProvider is rendered
    expect(screen.getByTestId('sdk-provider')).toBeInTheDocument()

    // Verify SDKProvider was called with the correct props
    const sdkProviderCalls = vi.mocked(SDKProvider).mock.calls
    expect(sdkProviderCalls.length).toBe(1)

    const [props] = sdkProviderCalls[0]
    const {config} = props

    // Config should be passed to SDKProvider in the same order
    expect(config).toEqual(legacyConfigs)
  })

  it('handles iframe environment correctly', async () => {
    // Mock window.self and window.top to simulate iframe environment
    const originalTop = window.top
    const originalSelf = window.self

    const mockSanityConfig: SanityConfig = {
      projectId: 'test-project',
      dataset: 'test-dataset',
    }

    const mockTop = {}
    Object.defineProperty(window, 'top', {
      value: mockTop,
      writable: true,
    })
    Object.defineProperty(window, 'self', {
      value: window,
      writable: true,
    })

    render(
      <SanityApp config={[mockSanityConfig]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )

    // Wait for 1 second
    await new Promise((resolve) => setTimeout(resolve, 1010))

    // Add assertions based on your iframe-specific behavior
    expect(window.location.href).toBe('http://localhost:3000/')

    // Clean up the mock
    Object.defineProperty(window, 'top', {
      value: originalTop,
      writable: true,
    })
    Object.defineProperty(window, 'self', {
      value: originalSelf,
      writable: true,
    })
  })

  it('redirects to core if not inside iframe and not local url', async () => {
    const originalLocation = window.location

    const mockLocation = {
      replace: vi.fn(),
      href: 'http://sanity-test.app',
    }

    const mockSanityConfig: SanityConfig = {
      projectId: 'test-project',
      dataset: 'test-dataset',
    }

    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
    })

    render(
      <SanityApp config={[mockSanityConfig]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )

    // Wait for 1 second
    await new Promise((resolve) => setTimeout(resolve, 1010))

    // Add assertions based on your iframe-specific behavior
    expect(mockLocation.replace).toHaveBeenCalledWith('https://sanity.io/welcome')

    // Clean up the mock
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })

  it('does not redirect to core if not inside iframe and local url', async () => {
    const originalLocation = window.location

    const mockSanityConfig: SanityConfig = {
      projectId: 'test-project',
      dataset: 'test-dataset',
    }

    const mockLocation = {
      replace: vi.fn(),
      href: 'http://localhost:3000',
    }

    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
    })

    render(
      <SanityApp config={[mockSanityConfig]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )

    // Wait for 1 second
    await new Promise((resolve) => setTimeout(resolve, 1010))

    // Add assertions based on your iframe-specific behavior
    expect(mockLocation.replace).not.toHaveBeenCalled()

    // Clean up the mock
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })
})
