import * as SanitySDK from '@sanity/sdk'
import {render} from '@testing-library/react'
import {type ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

import {type SanityProviderProps} from '../context/SanityProvider'
import {SDKProvider} from './SDKProvider'

// Mock the SDK module
vi.mock('@sanity/sdk', () => ({
  createSanityInstance: vi.fn(() => ({
    // Mock return value of createSanityInstance
    id: 'mock-instance',
  })),
}))

// Mock the SanityProvider context to verify the instance is passed correctly
vi.mock('../context/SanityProvider', () => ({
  SanityProvider: ({children, sanityInstances}: SanityProviderProps) => (
    <div data-testid="sanity-provider" data-instances={JSON.stringify(sanityInstances)}>
      {children}
    </div>
  ),
  useSanity: vi.fn(),
}))

// Mock the AuthBoundary component
vi.mock('./auth/AuthBoundary', () => ({
  AuthBoundary: ({children}: {children: ReactNode}) => (
    <div data-testid="auth-boundary">{children}</div>
  ),
}))

describe('SDKProvider', () => {
  const mockConfig = {
    projectId: 'test-project',
    dataset: 'test-dataset',
  }

  it('creates a Sanity instance with the provided config', () => {
    render(
      <SDKProvider sanityConfigs={[mockConfig]}>
        <div>Test Child</div>
      </SDKProvider>,
    )

    expect(SanitySDK.createSanityInstance).toHaveBeenCalledWith(mockConfig)
  })

  it('renders children within SanityProvider and AuthBoundary', () => {
    const {getByText, getByTestId} = render(
      <SDKProvider sanityConfigs={[mockConfig]}>
        <div>Test Child</div>
      </SDKProvider>,
    )

    // Verify the component hierarchy
    const sanityProvider = getByTestId('sanity-provider')
    const authBoundary = getByTestId('auth-boundary')
    const childElement = getByText('Test Child')

    expect(sanityProvider).toBeInTheDocument()
    expect(authBoundary).toBeInTheDocument()
    expect(childElement).toBeInTheDocument()
  })

  it('passes the created Sanity instance to SanityProvider', () => {
    const {getByTestId} = render(
      <SDKProvider sanityConfigs={[mockConfig]}>
        <div>Test Child</div>
      </SDKProvider>,
    )

    const sanityProvider = getByTestId('sanity-provider')
    const passedInstances = JSON.parse(sanityProvider.dataset['instances'] || '[]')

    expect(passedInstances).toEqual([{id: 'mock-instance'}])
  })
})
