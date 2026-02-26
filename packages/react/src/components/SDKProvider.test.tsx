import {render} from '@testing-library/react'
import React from 'react'
import {describe, expect, it, vi} from 'vitest'

import {SDKProvider} from './SDKProvider'

vi.mock('../context/ResourceProvider', () => ({
  ResourceProvider: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    defaultSource?: unknown
  }) => {
    return (
      <div
        data-testid="resource-provider"
        data-config={JSON.stringify({defaultSource: props.defaultSource})}
      >
        {children}
      </div>
    )
  },
}))

vi.mock('./auth/AuthBoundary', () => ({
  AuthBoundary: ({children}: {children: React.ReactNode}) => {
    return <div data-testid="auth-boundary">{children}</div>
  },
}))

describe('SDKProvider', () => {
  it('renders a single ResourceProvider with AuthBoundary', () => {
    const config = {
      defaultSource: {projectId: 'test-project', dataset: 'production'},
    }
    const sources = {
      default: {projectId: 'test-project', dataset: 'production'},
    }

    const {getByTestId} = render(
      <SDKProvider config={config} sources={sources} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const provider = getByTestId('resource-provider')
    expect(provider).toBeInTheDocument()

    expect(getByTestId('auth-boundary')).toBeInTheDocument()

    expect(JSON.parse(provider.getAttribute('data-config') || '{}')).toEqual({
      defaultSource: {projectId: 'test-project', dataset: 'production'},
    })
  })

  it('renders with multiple named sources', () => {
    const config = {
      defaultSource: {projectId: 'project-1', dataset: 'production'},
    }
    const sources = {
      default: {projectId: 'project-1', dataset: 'production'},
      secondary: {projectId: 'project-2', dataset: 'staging'},
    }

    const {getByTestId} = render(
      <SDKProvider config={config} sources={sources} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const provider = getByTestId('resource-provider')
    expect(provider).toBeInTheDocument()

    expect(JSON.parse(provider.getAttribute('data-config') || '{}')).toEqual({
      defaultSource: {projectId: 'project-1', dataset: 'production'},
    })
  })
})
