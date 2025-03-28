import {render} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {type ResourceProviderProps} from '../context/ResourceProvider'
import {SanityApp} from './SanityApp'

// Mock ResourceProvider to verify the nested structure
vi.mock('../context/ResourceProvider', () => ({
  ResourceProvider: ({children, fallback: _fallback, ...config}: ResourceProviderProps) => {
    // Save the config in a data attribute for testing
    return (
      <div data-testid="resource-provider" data-config={JSON.stringify(config)}>
        {children}
      </div>
    )
  },
}))

// Mock useEffect to prevent redirect logic from running in tests
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    useEffect: vi.fn((fn) => fn()),
  }
})

describe('SanityApp', () => {
  it('renders a single ResourceProvider for a single config', () => {
    const singleConfig = {
      projectId: 'test-project',
      dataset: 'production',
    }

    const {getAllByTestId} = render(
      <SanityApp config={singleConfig} fallback={<div>Loading...</div>}>
        <div>Child content</div>
      </SanityApp>,
    )

    // Should render one ResourceProvider
    const providers = getAllByTestId('resource-provider')
    expect(providers).toHaveLength(1)
    expect(JSON.parse(providers[0].getAttribute('data-config') || '{}')).toEqual(singleConfig)
  })

  it('renders nested ResourceProviders for multiple configs', () => {
    const multipleConfigs = [
      {
        projectId: 'project-1',
        dataset: 'production',
      },
      {
        projectId: 'project-2',
        dataset: 'staging',
      },
      {
        projectId: 'project-3',
        dataset: 'development',
      },
    ]

    const {getAllByTestId} = render(
      <SanityApp config={multipleConfigs} fallback={<div>Loading...</div>}>
        <div>Child content</div>
      </SanityApp>,
    )

    // Should render three nested ResourceProviders
    const providers = getAllByTestId('resource-provider')
    expect(providers).toHaveLength(3)

    // Verify each provider has the correct config
    expect(JSON.parse(providers[0].getAttribute('data-config') || '{}')).toEqual(multipleConfigs[0])
    expect(JSON.parse(providers[1].getAttribute('data-config') || '{}')).toEqual(multipleConfigs[1])
    expect(JSON.parse(providers[2].getAttribute('data-config') || '{}')).toEqual(multipleConfigs[2])
  })

  it('supports legacy sanityConfigs prop', () => {
    const legacyConfigs = [
      {
        projectId: 'legacy-project-1',
        dataset: 'production',
      },
      {
        projectId: 'legacy-project-2',
        dataset: 'staging',
      },
    ]

    const {getAllByTestId} = render(
      // @ts-expect-error purposefully using the deprecated prop
      <SanityApp sanityConfigs={legacyConfigs} fallback={<div>Loading...</div>}>
        <div>Child content</div>
      </SanityApp>,
    )

    // Should render two nested ResourceProviders
    const providers = getAllByTestId('resource-provider')
    expect(providers).toHaveLength(2)

    // Verify each provider has the correct config
    expect(JSON.parse(providers[0].getAttribute('data-config') || '{}')).toEqual(legacyConfigs[0])
    expect(JSON.parse(providers[1].getAttribute('data-config') || '{}')).toEqual(legacyConfigs[1])
  })
})
