import {type SanityConfig} from '@sanity/sdk'
import {render} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {SanityApp} from '../components/SanityApp'
import {SDKStudioContext, type StudioWorkspaceHandle} from './SDKStudioContext'

// Mock SDKProvider to capture the config it receives
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
    expect(receivedConfig).toMatchObject({
      projectId: 'studio-project-id',
      dataset: 'production',
      studio: {
        auth: {token: mockWorkspace.auth.token},
      },
    })
  })

  it('explicit config takes precedence over SDKStudioContext', () => {
    const explicitConfig: SanityConfig = {
      projectId: 'explicit-project',
      dataset: 'staging',
    }

    render(
      <SDKStudioContext.Provider value={mockWorkspace}>
        <SanityApp config={explicitConfig} fallback={<div>Loading</div>}>
          <div>Child</div>
        </SanityApp>
      </SDKStudioContext.Provider>,
    )

    expect(mockSDKProvider).toHaveBeenCalled()
    const receivedConfig = mockSDKProvider.mock.calls[0][0].config as SanityConfig
    expect(receivedConfig).toMatchObject({
      projectId: 'explicit-project',
      dataset: 'staging',
    })
    // Should NOT have studio config from the context
    expect(receivedConfig.studio).toBeUndefined()
  })

  it('SanityApp works without SDKStudioContext (standalone mode)', () => {
    const standaloneConfig: SanityConfig = {
      projectId: 'standalone-project',
      dataset: 'production',
    }

    render(
      <SanityApp config={standaloneConfig} fallback={<div>Loading</div>}>
        <div>Child</div>
      </SanityApp>,
    )

    expect(mockSDKProvider).toHaveBeenCalled()
    const receivedConfig = mockSDKProvider.mock.calls[0][0].config as SanityConfig
    expect(receivedConfig).toMatchObject({
      projectId: 'standalone-project',
      dataset: 'production',
    })
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
    expect(receivedConfig).toMatchObject({
      projectId: 'older-studio',
      dataset: 'production',
    })
    // studio config should be present but auth.token should be undefined
    expect(receivedConfig.studio).toBeDefined()
    expect(receivedConfig.studio?.auth).toBeUndefined()
  })
})
