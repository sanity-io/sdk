import {type SanityConfig} from '@sanity/sdk'
import {render} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {SanityApp} from '../components/SanityApp'
import {SDKStudioContext, type StudioWorkspaceHandle} from './SDKStudioContext'

// Mock SDKProvider to capture the config and sources it receives
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
      defaultSource: {projectId: 'studio-project-id', dataset: 'production'},
      studio: {
        auth: {token: mockWorkspace.auth.token},
      },
    })
    const receivedSources = mockSDKProvider.mock.calls[0][0].sources
    expect(receivedSources).toEqual({
      default: {projectId: 'studio-project-id', dataset: 'production'},
    })
  })

  it('explicit config takes precedence over SDKStudioContext', () => {
    const explicitConfig: SanityConfig = {
      defaultSource: {projectId: 'explicit-project', dataset: 'staging'},
    }

    render(
      <SDKStudioContext.Provider value={mockWorkspace}>
        <SanityApp
          config={explicitConfig}
          sources={{default: {projectId: 'explicit-project', dataset: 'staging'}}}
          fallback={<div>Loading</div>}
        >
          <div>Child</div>
        </SanityApp>
      </SDKStudioContext.Provider>,
    )

    expect(mockSDKProvider).toHaveBeenCalled()
    const receivedConfig = mockSDKProvider.mock.calls[0][0].config as SanityConfig
    expect(receivedConfig).toMatchObject({
      defaultSource: {projectId: 'explicit-project', dataset: 'staging'},
    })
    expect(receivedConfig.studio).toBeUndefined()
  })

  it('SanityApp works without SDKStudioContext (standalone mode)', () => {
    const standaloneConfig: SanityConfig = {
      defaultSource: {projectId: 'standalone-project', dataset: 'production'},
    }

    render(
      <SanityApp config={standaloneConfig} fallback={<div>Loading</div>}>
        <div>Child</div>
      </SanityApp>,
    )

    expect(mockSDKProvider).toHaveBeenCalled()
    const receivedConfig = mockSDKProvider.mock.calls[0][0].config as SanityConfig
    expect(receivedConfig).toMatchObject({
      defaultSource: {projectId: 'standalone-project', dataset: 'production'},
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
      defaultSource: {projectId: 'older-studio', dataset: 'production'},
    })
    expect(receivedConfig.studio).toBeDefined()
    expect(receivedConfig.studio?.auth).toBeUndefined()
  })
})
