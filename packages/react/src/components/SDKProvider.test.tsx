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
