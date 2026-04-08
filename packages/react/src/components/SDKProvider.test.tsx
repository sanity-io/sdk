import {createSanityInstance} from '@sanity/sdk'
import {render} from '@testing-library/react'
import React from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useDashboardOrganizationId} from '../hooks/auth/useDashboardOrganizationId'
import {resolveOrgResources} from '../utils/resolveOrgResources'
import {SDKProvider} from './SDKProvider'

const instance = createSanityInstance()

// Returns the same object on every call so the module-level WeakMap cache works across renders.
vi.mock('../hooks/context/useSanityInstance', () => {
  return {useSanityInstance: () => instance}
})

vi.mock('../hooks/auth/useDashboardOrganizationId', () => ({
  useDashboardOrganizationId: vi.fn(),
}))

vi.mock('../utils/resolveOrgResources', () => ({
  resolveOrgResources: vi.fn(),
}))

vi.mock('../context/ResourceProvider', () => ({
  ResourceProvider: ({children, resource}: {children: React.ReactNode; resource?: unknown}) => (
    <div data-testid="resource-provider" data-resource={JSON.stringify(resource ?? null)}>
      {children}
    </div>
  ),
}))

vi.mock('./auth/AuthBoundary', () => ({
  AuthBoundary: ({children}: {children: React.ReactNode}) => (
    <div data-testid="auth-boundary">{children}</div>
  ),
}))

const mockResolveOrgResources = vi.mocked(resolveOrgResources)
const mockUseDashboardOrganizationId = vi.mocked(useDashboardOrganizationId)

describe('SDKProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveOrgResources.mockResolvedValue({})
    mockUseDashboardOrganizationId.mockReturnValue(undefined)
  })

  it('renders a single ResourceProvider with AuthBoundary', () => {
    const config = {}
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

    // resource prop should be the default resource
    expect(JSON.parse(provider.getAttribute('data-resource') || 'null')).toEqual({
      projectId: 'test-project',
      dataset: 'production',
    })
  })

  it('renders with multiple named resources', () => {
    const config = {}
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

    expect(JSON.parse(provider.getAttribute('data-resource') || 'null')).toEqual({
      projectId: 'project-1',
      dataset: 'production',
    })
  })
})
