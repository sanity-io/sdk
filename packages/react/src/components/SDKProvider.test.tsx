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
    sources?: Record<string, unknown>
  }) => {
    return (
      <div data-testid="resource-provider" data-config={JSON.stringify({sources: props.sources})}>
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
      sources: {
        default: {projectId: 'test-project', dataset: 'production'},
      },
    }

    const {getAllByTestId, getByTestId} = render(
      <SDKProvider config={[config]} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const providers = getAllByTestId('resource-provider')
    expect(providers.length).toBe(1)

    expect(getByTestId('auth-boundary')).toBeInTheDocument()

    expect(JSON.parse(providers[0].getAttribute('data-config') || '{}')).toEqual({
      sources: {default: {projectId: 'test-project', dataset: 'production'}},
    })
  })

  it('renders nested ResourceProviders with AuthBoundary for multiple configs', () => {
    const configs = [
      {
        sources: {default: {projectId: 'project-1', dataset: 'production'}},
      },
      {
        sources: {default: {projectId: 'project-2', dataset: 'staging'}},
      },
    ]

    const {getAllByTestId, getByTestId} = render(
      <SDKProvider config={configs} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const providers = getAllByTestId('resource-provider')
    expect(providers.length).toBe(2)

    expect(getByTestId('auth-boundary')).toBeInTheDocument()

    expect(JSON.parse(providers[0].getAttribute('data-config') || '{}')).toEqual({
      sources: {default: {projectId: 'project-2', dataset: 'staging'}},
    })

    expect(JSON.parse(providers[1].getAttribute('data-config') || '{}')).toEqual({
      sources: {default: {projectId: 'project-1', dataset: 'production'}},
    })
  })
})
