import {reportError} from '@sanity/sdk/_internal'
import {render, screen} from '@testing-library/react'
import {Component, type ReactNode} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {SDKProvider} from './SDKProvider'

// Renders the real `react-error-boundary`, which skips `onError` when the fallback rethrows.
vi.mock('@sanity/sdk/_internal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  reportError: vi.fn(),
}))
vi.mock('../context/ResourceProvider', () => ({
  ResourceProvider: ({children}: {children: ReactNode}) => children,
}))
vi.mock('./auth/AuthBoundary', () => ({
  AuthBoundary: ({children}: {children: ReactNode}) => children,
}))
vi.mock('../context/OrganizationResourcesProvider', () => ({
  OrganizationResourcesProvider: ({children}: {children: ReactNode}) => children,
}))

class AppBoundary extends Component<{children: ReactNode}, {caught: boolean}> {
  override state = {caught: false}
  static getDerivedStateFromError() {
    return {caught: true}
  }
  override render() {
    return this.state.caught ? 'app boundary caught it' : this.props.children
  }
}

function Thrower({error}: {error: Error}): never {
  throw error
}

describe('SDKProvider error reporting', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('reports an error it rethrows, and the app boundary still receives it', () => {
    const error = new TypeError('sdk bug')
    render(
      <AppBoundary>
        <SDKProvider config={{projectId: 'p', dataset: 'd'}} fallback={null}>
          <Thrower error={error} />
        </SDKProvider>
      </AppBoundary>,
    )

    expect(screen.getByText('app boundary caught it')).toBeInTheDocument()
    expect(reportError).toHaveBeenCalledWith(error, {errorBoundary: 'SDKProvider'})
  })

  it('does not report a chunk load error, which it renders itself', () => {
    const error = Object.assign(new Error('Loading chunk 5 failed.'), {name: 'ChunkLoadError'})
    render(
      <AppBoundary>
        <SDKProvider config={{projectId: 'p', dataset: 'd'}} fallback={null}>
          <Thrower error={error} />
        </SDKProvider>
      </AppBoundary>,
    )

    expect(reportError).not.toHaveBeenCalled()
  })
})
