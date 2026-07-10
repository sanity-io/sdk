import {createSanityInstance, type SanityConfig} from '@sanity/sdk'
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
  ResourceProvider: ({
    children,
    // exclude fallback: it's a real ResourceProvider prop but not part of config
    fallback: _fallback,
    resource,
    ...config
  }: {
    children: React.ReactNode
    fallback?: React.ReactNode
    resource?: {projectId?: string; dataset?: string}
  }) => (
    <div
      data-testid="resource-provider"
      data-config={JSON.stringify(config)}
      data-resource={JSON.stringify(resource ?? null)}
    >
      {children}
    </div>
  ),
}))

vi.mock('./auth/AuthBoundary', () => ({
  AuthBoundary: ({children, projectIds}: {children: React.ReactNode; projectIds?: string[]}) => (
    <div data-testid="auth-boundary" data-project-ids={JSON.stringify(projectIds ?? [])}>
      {children}
    </div>
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

  it('preserves non-resource config fields (e.g. studio auth, perspective) on the root provider', () => {
    const tokenSource = {subscribe: () => ({unsubscribe: () => {}})}
    const config: SanityConfig = {
      projectId: 'test-project',
      dataset: 'production',
      perspective: 'published',
      studio: {authenticated: true, auth: {token: tokenSource}},
    }

    const {getAllByTestId} = render(
      <SDKProvider config={config} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const providers = getAllByTestId('resource-provider')
    // The full first config is spread onto the root ResourceProvider so the
    // root SanityInstance retains auth/perspective/etc. (The token source is a
    // function and doesn't survive JSON serialization, so assert on the
    // serializable fields and that the studio config object is carried through.)
    const spreadConfig = JSON.parse(providers[0].getAttribute('data-config') || '{}')
    expect(spreadConfig).toMatchObject({
      projectId: 'test-project',
      dataset: 'production',
      perspective: 'published',
      studio: {authenticated: true},
    })
  })

  it('synthesizes the default resource from the first config when none is explicit', () => {
    const config = {projectId: 'test-project', dataset: 'production'}

    const {getAllByTestId} = render(
      <SDKProvider config={config} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const providers = getAllByTestId('resource-provider')
    expect(JSON.parse(providers[0].getAttribute('data-resource') || 'null')).toEqual({
      projectId: 'test-project',
      dataset: 'production',
    })
  })

  it('uses an explicitly provided "default" resource over the config-derived one', () => {
    const config = {projectId: 'config-project', dataset: 'production'}
    const resources = {default: {projectId: 'explicit-project', dataset: 'staging'}}

    const {getAllByTestId} = render(
      <SDKProvider config={config} resources={resources} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const providers = getAllByTestId('resource-provider')
    // Config fields still flow through for instance creation…
    expect(JSON.parse(providers[0].getAttribute('data-config') || '{}')).toEqual(config)
    // …but the explicit default resource wins as the resource context value.
    expect(JSON.parse(providers[0].getAttribute('data-resource') || 'null')).toEqual(
      resources.default,
    )
  })

  it('collects deduped projectIds from both config and explicit resources', () => {
    const configs = [
      {projectId: 'project-1', dataset: 'production'},
      {projectId: 'project-2', dataset: 'production'},
    ]
    const resources = {
      // duplicates project-1 (should be deduped)
      default: {projectId: 'project-1', dataset: 'production'},
      other: {projectId: 'project-3', dataset: 'production'},
    }

    const {getByTestId} = render(
      <SDKProvider config={configs} resources={resources} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const projectIds = JSON.parse(
      getByTestId('auth-boundary').getAttribute('data-project-ids') || '[]',
    )
    expect([...projectIds].sort()).toEqual(['project-1', 'project-2', 'project-3'])
  })
})
