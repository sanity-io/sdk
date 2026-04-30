import {render} from '@testing-library/react'
import React from 'react'
import {describe, expect, it, vi} from 'vitest'

import {SDKProvider} from './SDKProvider'

// Mock ResourceProvider to test nesting behavior
vi.mock('../context/ResourceProvider', () => ({
  ResourceProvider: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    projectId?: string
    dataset?: string
  }) => {
    return (
      <div
        data-testid="resource-provider"
        data-config={JSON.stringify({
          projectId: props.projectId,
          dataset: props.dataset,
        })}
      >
        {children}
      </div>
    )
  },
}))

// Mock AuthBoundary
vi.mock('./auth/AuthBoundary', () => ({
  AuthBoundary: ({children}: {children: React.ReactNode}) => {
    return <div data-testid="auth-boundary">{children}</div>
  },
}))

describe('SDKProvider', () => {
  it('renders single ResourceProvider with AuthBoundary for a single config', () => {
    const config = {
      projectId: 'test-project',
      dataset: 'production',
    }

    const {getAllByTestId, getByTestId} = render(
      <SDKProvider config={[config]} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    // Should create a single ResourceProvider
    const providers = getAllByTestId('resource-provider')
    expect(providers.length).toBe(1)

    // Should create an AuthBoundary inside
    expect(getByTestId('auth-boundary')).toBeInTheDocument()

    // Verify provider has the correct config
    expect(JSON.parse(providers[0].getAttribute('data-config') || '{}')).toEqual({
      projectId: 'test-project',
      dataset: 'production',
    })
  })

  it('renders a single ResourceProvider using the first config when multiple configs are provided', () => {
    const configs = [
      {
        projectId: 'project-1',
        dataset: 'production',
      },
      {
        projectId: 'project-2',
        dataset: 'staging',
      },
    ]

    const {getAllByTestId, getByTestId} = render(
      <SDKProvider config={configs} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    // Should create a single ResourceProvider using the first config
    const providers = getAllByTestId('resource-provider')
    expect(providers.length).toBe(1)

    // Should create an AuthBoundary inside
    expect(getByTestId('auth-boundary')).toBeInTheDocument()

    // Verify the provider uses the first config
    expect(JSON.parse(providers[0].getAttribute('data-config') || '{}')).toEqual({
      projectId: 'project-1',
      dataset: 'production',
    })
  })
})
