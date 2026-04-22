import {type SanityConfig} from '@sanity/sdk'
import {render} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {SanityApp} from '../components/SanityApp'
import {SDKStudioContext, type StudioWorkspaceHandle} from './SDKStudioContext'

// Mock SDKProvider to capture the config and resources it receives
const mockSDKProvider = vi.hoisted(() => vi.fn())
vi.mock('../components/SDKProvider', () => ({
  SDKProvider: mockSDKProvider.mockImplementation(({children}) => (
    <div data-testid="sdk-provider">{children}</div>
  )),
}))

// Mock utils to prevent redirect logic
vi.mock('../components/utils', () => ({
  isInIframe: () => true,
  isLocalUrl: () => true,
  DEFAULT_RESOURCE_NAME: 'default',
}))

describe('SDKStudioContext', () => {
  beforeEach(() => {
    mockSDKProvider.mockClear()
  })

  const mockWorkspace: StudioWorkspaceHandle = {
    projectId: 'studio-project-id',
    dataset: 'production',
    auth: {
      token: {
        subscribe: vi.fn(() => ({unsubscribe: vi.fn()})),
      },
    },
  }

  it('SanityApp derives config from SDKStudioContext when no config prop is given', () => {
    render(
      <SDKStudioContext.Provider value={mockWorkspace}>
        <SanityApp fallback={<div>Loading</div>}>
          <div>Child</div>
        </SanityApp>
      </SDKStudioContext.Provider>,
    )

    expect(mockSDKProvider).toHaveBeenCalled()
    const receivedConfig = mockSDKProvider.mock.calls[0][0].config as SanityConfig
    // config carries studio auth only; no resource fields
    expect(receivedConfig).toMatchObject({
      studio: {
        auth: {token: mockWorkspace.auth.token},
      },
    })
    expect(receivedConfig).not.toHaveProperty('defaultResource')
    // resource goes into the resources map, not config
    const receivedResources = mockSDKProvider.mock.calls[0][0].resources
    expect(receivedResources).toEqual({
      default: {projectId: 'studio-project-id', dataset: 'production'},
    })
  })

  it('explicit config takes precedence over SDKStudioContext', () => {
    const explicitConfig: SanityConfig = {}
    const explicitResources = {default: {projectId: 'explicit-project', dataset: 'staging'}}

    render(
      <SDKStudioContext.Provider value={mockWorkspace}>
        <SanityApp
          config={explicitConfig}
          resources={explicitResources}
          fallback={<div>Loading</div>}
        >
          <div>Child</div>
        </SanityApp>
      </SDKStudioContext.Provider>,
    )

    expect(mockSDKProvider).toHaveBeenCalled()
    const receivedConfig = mockSDKProvider.mock.calls[0][0].config as SanityConfig
    expect(receivedConfig).toEqual(explicitConfig)
    expect(receivedConfig.studio).toBeUndefined()
    const receivedResources = mockSDKProvider.mock.calls[0][0].resources
    expect(receivedResources).toEqual(explicitResources)
  })

  it('SanityApp works without SDKStudioContext (standalone mode)', () => {
    const standaloneConfig: SanityConfig = {}
    const standaloneResources = {default: {projectId: 'standalone-project', dataset: 'production'}}

    render(
      <SanityApp
        config={standaloneConfig}
        resources={standaloneResources}
        fallback={<div>Loading</div>}
      >
        <div>Child</div>
      </SanityApp>,
    )

    expect(mockSDKProvider).toHaveBeenCalled()
    const receivedConfig = mockSDKProvider.mock.calls[0][0].config as SanityConfig
    expect(receivedConfig).toEqual(standaloneConfig)
    const receivedResources = mockSDKProvider.mock.calls[0][0].resources
    expect(receivedResources).toEqual(standaloneResources)
  })

  it('handles workspace without auth.token (older Studio)', () => {
    const olderWorkspace: StudioWorkspaceHandle = {
      projectId: 'older-studio',
      dataset: 'production',
      auth: {},
    }

    render(
      <SDKStudioContext.Provider value={olderWorkspace}>
        <SanityApp fallback={<div>Loading</div>}>
          <div>Child</div>
        </SanityApp>
      </SDKStudioContext.Provider>,
    )

    expect(mockSDKProvider).toHaveBeenCalled()
    const receivedConfig = mockSDKProvider.mock.calls[0][0].config as SanityConfig
    expect(receivedConfig).toMatchObject({studio: expect.any(Object)})
    expect(receivedConfig.studio?.auth).toBeUndefined()
    const receivedResources = mockSDKProvider.mock.calls[0][0].resources
    expect(receivedResources).toEqual({
      default: {projectId: 'older-studio', dataset: 'production'},
    })
  })
})
