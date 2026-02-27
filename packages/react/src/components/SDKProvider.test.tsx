import {render} from '@testing-library/react'
import React from 'react'
import {describe, expect, it, vi} from 'vitest'

import {SDKProvider} from './SDKProvider'

vi.mock('../context/ResourceProvider', () => ({
  ResourceProvider: ({children, resource}: {children: React.ReactNode; resource?: unknown}) => {
    return (
      <div
        data-testid="resource-provider"
        data-config={JSON.stringify({defaultResource: resource})}
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
      defaultResource: {projectId: 'test-project', dataset: 'production'},
    }
    const resources = {
      default: {projectId: 'test-project', dataset: 'production'},
    }

    const {getByTestId} = render(
      <SDKProvider config={config} resources={resources} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const provider = getByTestId('resource-provider')
    expect(provider).toBeInTheDocument()

    expect(getByTestId('auth-boundary')).toBeInTheDocument()

    expect(JSON.parse(provider.getAttribute('data-config') || '{}')).toEqual({
      defaultResource: {projectId: 'test-project', dataset: 'production'},
    })
  })

  it('renders with multiple named resources', () => {
    const config = {
      defaultResource: {projectId: 'project-1', dataset: 'production'},
    }
    const resources = {
      default: {projectId: 'project-1', dataset: 'production'},
      secondary: {projectId: 'project-2', dataset: 'staging'},
    }

    const {getByTestId} = render(
      <SDKProvider config={config} resources={resources} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const provider = getByTestId('resource-provider')
    expect(provider).toBeInTheDocument()

    expect(JSON.parse(provider.getAttribute('data-config') || '{}')).toEqual({
      defaultResource: {projectId: 'project-1', dataset: 'production'},
    })
  })
})
