import {AuthStateType, type SanityConfig} from '@sanity/sdk'
import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {render, screen} from '@testing-library/react'
import {describe, expect, it, onTestFinished, vi} from 'vitest'

import {SanityApp} from './SanityApp'
import {type SDKProviderProps} from './SDKProvider'

// Hoist the mock function definition
// Rely on vi.fn type inference
const mockSDKProviderComponent = vi.hoisted(() =>
  vi.fn((_props: SDKProviderProps) => (
    // Simplified mock, doesn't access config directly to avoid type issues
    <div data-testid="sdk-provider">SDKProvider Mock</div>
  )),
)

// Use the hoisted mock in the factory
vi.mock('./SDKProvider', () => ({
  SDKProvider: mockSDKProviderComponent,
}))

vi.mock('../hooks/auth/useAuthState', () => ({
  useAuthState: () => ({
    type: AuthStateType.LOGGED_IN,
    session: {
      user: {
        id: 'test-user',
      },
    },
  }),
}))

const sanityConfig: SanityConfig = {projectId: 'test-project', dataset: 'test-dataset'}

function stubLocation(href: string) {
  const originalLocation = window.location
  const location = {replace: vi.fn(), href}
  Object.defineProperty(window, 'location', {value: location, writable: true})
  onTestFinished(() => {
    Object.defineProperty(window, 'location', {value: originalLocation, writable: true})
  })
  return location
}

describe('SanityApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Access the mock instance correctly
    mockSDKProviderComponent.mockClear()
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })
  })

  it('renders SDKProvider with a single config', () => {
    const singleConfig = {
      projectId: 'test-project',
      dataset: 'production',
    }

    render(
      <SanityApp config={singleConfig} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SanityApp>,
    )

    // Check that the SDKProvider is rendered
    expect(screen.getByTestId('sdk-provider')).toBeInTheDocument()

    // Verify SDKProvider was called with the correct props
    expect(mockSDKProviderComponent).toHaveBeenCalledTimes(1)
    const sdkProviderCalls = mockSDKProviderComponent.mock.calls
    const firstCallArgs1 = sdkProviderCalls[0]
    expect(firstCallArgs1).toBeDefined()
    expect(firstCallArgs1.length).toBeGreaterThan(0)
    const props = firstCallArgs1[0] as unknown as SDKProviderProps
    const config = props?.config

    // Config is now passed directly as an object for single configs
    expect(config).toEqual(singleConfig)
    expect(props.fallback).toBeTruthy()
  })

  it('renders SDKProvider with multiple configs in original order', () => {
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

    render(
      <SanityApp config={multipleConfigs} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SanityApp>,
    )

    // Check that the SDKProvider is rendered
    expect(screen.getByTestId('sdk-provider')).toBeInTheDocument()

    // Verify SDKProvider was called with the correct props
    expect(mockSDKProviderComponent).toHaveBeenCalledTimes(1)
    const sdkProviderCalls = mockSDKProviderComponent.mock.calls
    const firstCallArgs2 = sdkProviderCalls[0]
    expect(firstCallArgs2).toBeDefined()
    expect(firstCallArgs2.length).toBeGreaterThan(0)
    const props = firstCallArgs2[0] as unknown as SDKProviderProps
    const config = props?.config

    // Config should be passed directly to SDKProvider
    expect(config).toEqual(multipleConfigs)
  })

  it('handles iframe environment correctly', async () => {
    const location = stubLocation('http://sanity-test.app')
    const originalTop = window.top
    Object.defineProperty(window, 'top', {value: {}, writable: true})
    onTestFinished(() => {
      Object.defineProperty(window, 'top', {value: originalTop, writable: true})
    })

    render(
      <SanityApp config={[sanityConfig]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )
    await vi.advanceTimersByTimeAsync(1000)

    expect(location.replace).not.toHaveBeenCalled()
  })

  it('redirects to core if not inside iframe and not local url', async () => {
    const location = stubLocation('http://sanity-test.app')

    render(
      <SanityApp config={[sanityConfig]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )
    await vi.advanceTimersByTimeAsync(1000)

    expect(location.replace).toHaveBeenCalledWith('https://sanity.io/welcome')
  })

  it('does not redirect to core if unmounted before the redirect fires', async () => {
    const location = stubLocation('http://sanity-test.app')

    const {unmount} = render(
      <SanityApp config={[sanityConfig]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )
    unmount()
    await vi.advanceTimersByTimeAsync(1000)

    expect(location.replace).not.toHaveBeenCalled()
  })

  it('does not redirect to core if a message bus is installed', async () => {
    const location = stubLocation('http://sanity-test.app')
    installMessageBus({appId: 'workbench'})
    onTestFinished(() => {
      resetMessageBus()
      delete (globalThis as {[key: symbol]: unknown})[Symbol.for('sanity.os.bus')]
    })

    render(
      <SanityApp config={[sanityConfig]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )
    await vi.advanceTimersByTimeAsync(1000)

    expect(location.replace).not.toHaveBeenCalled()
  })

  it('redirects to core if config is omitted and no studio context is available', async () => {
    const location = stubLocation('http://sanity-test.app')

    render(
      <SanityApp fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )
    await vi.advanceTimersByTimeAsync(1000)

    expect(location.replace).toHaveBeenCalledWith('https://sanity.io/welcome')
  })

  it('does not redirect to core if not inside iframe and local url', async () => {
    const location = stubLocation('http://localhost:3000')

    render(
      <SanityApp config={[sanityConfig]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )
    await vi.advanceTimersByTimeAsync(1000)

    expect(location.replace).not.toHaveBeenCalled()
  })

  it('does not redirect to core if studio config is provided', async () => {
    const location = stubLocation('http://sanity-test.app')

    render(
      <SanityApp config={[{...sanityConfig, studio: {}}]} fallback={<div>Fallback</div>}>
        <div>Test Child</div>
      </SanityApp>,
    )
    await vi.advanceTimersByTimeAsync(1000)

    expect(location.replace).not.toHaveBeenCalled()
  })
})
