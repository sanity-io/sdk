import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {render, screen} from '../../../test/test-utils'
import {ChunkLoadError} from './ChunkLoadError'
import {CHUNK_RELOAD_STORAGE_KEY} from './chunkReloadStorage'

const noop = (): void => {}

describe('ChunkLoadError', () => {
  const reloadSpy = vi.fn()
  const originalLocation = window.location

  beforeEach(() => {
    reloadSpy.mockReset()
    window.sessionStorage.clear()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {...originalLocation, reload: reloadSpy},
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {configurable: true, value: originalLocation})
    window.sessionStorage.clear()
  })

  it('triggers an automatic reload and renders nothing on the first occurrence', () => {
    render(
      <ChunkLoadError
        error={new Error('Failed to fetch dynamically imported module')}
        resetErrorBoundary={noop}
      />,
    )

    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBe('1')
    expect(screen.queryByText(/new version/i)).toBeNull()
  })

  it('renders the manual reload UI when the flag is already set', () => {
    window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, '1')

    render(
      <ChunkLoadError
        error={new Error('Failed to fetch dynamically imported module')}
        resetErrorBoundary={noop}
      />,
    )

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(screen.getByText('A new version is available')).toBeInTheDocument()

    const button = screen.getByRole('button', {name: 'Reload page'})
    button.click()

    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBeNull()
  })
})
