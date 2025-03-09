import {AuthStateType, type SanityConfig} from '@sanity/sdk'
import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {SanityApp} from './SanityApp'

vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
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
  const mockSanityConfig: SanityConfig = {
    projectId: 'test-project',
    dataset: 'test-dataset',
  }

  it('renders children correctly', async () => {
    const testMessage = 'Test Child Component'
    render(
      <SanityApp sanityConfigs={[mockSanityConfig]} fallback={<div>Fallback</div>}>
        <div>{testMessage}</div>
      </SanityApp>,
    )

    expect(await screen.findByText(testMessage)).toBeInTheDocument()
  })

  it('handles iframe environment correctly', async () => {
    // Mock window.self and window.top to simulate iframe environment
    const originalTop = window.top
    const originalSelf = window.self

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
      <SanityApp sanityConfigs={[mockSanityConfig]} fallback={<div>Fallback</div>}>
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

    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
    })

    render(
      <SanityApp sanityConfigs={[mockSanityConfig]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )

    // Wait for 1 second
    await new Promise((resolve) => setTimeout(resolve, 1010))

    // Add assertions based on your iframe-specific behavior
    expect(mockLocation.replace).toHaveBeenCalledWith('https://core.sanity.io')

    // Clean up the mock
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })

  it('does not redirect to core if not inside iframe and local url', async () => {
    const originalLocation = window.location

    const mockLocation = {
      replace: vi.fn(),
      href: 'http://localhost:3000',
    }

    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
    })

    render(
      <SanityApp sanityConfigs={[mockSanityConfig]} fallback={<div>Fallback</div>}>
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
