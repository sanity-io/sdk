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

  it('renders nested ResourceProviders with AuthBoundary for multiple configs', () => {
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

    // Should create two nested ResourceProviders
    const providers = getAllByTestId('resource-provider')
    expect(providers.length).toBe(2)

    // Should create an AuthBoundary inside the innermost provider
    expect(getByTestId('auth-boundary')).toBeInTheDocument()

    // Verify each provider has the correct config - order is based on how SDKProvider creates nestings
    // The first provider contains config[1]
    expect(JSON.parse(providers[0].getAttribute('data-config') || '{}')).toEqual({
      projectId: 'project-2',
      dataset: 'staging',
    })

    // The second provider contains config[0]
    expect(JSON.parse(providers[1].getAttribute('data-config') || '{}')).toEqual({
      projectId: 'project-1',
      dataset: 'production',
    })
  })
})
