import {renderHook, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useWindowTitle} from './useWindowTitle'

vi.mock('../comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(),
}))

function createContextResponse(resource: Record<string, unknown>) {
  return {context: {resource}}
}

describe('useWindowTitle', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.title = ''
  })

  it('should set the document title to the manifest title', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createContextResponse({
        type: 'application',
        title: 'sdk-movie-list',
        manifest: {title: 'Movie List App'},
      }),
    )
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    renderHook(() => useWindowTitle())

    await waitFor(() => {
      expect(document.title).toBe('Movie List App')
    })
  })

  it('should prefer manifest title over system title', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createContextResponse({
        type: 'application',
        title: 'sdk-movie-list',
        manifest: {title: 'Movie List App'},
        activeDeployment: {manifest: {title: 'Deployed Title'}},
      }),
    )
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    renderHook(() => useWindowTitle())

    await waitFor(() => {
      expect(document.title).toBe('Movie List App')
    })
  })

  it('should fall back to activeDeployment manifest title', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createContextResponse({
        type: 'application',
        title: 'sdk-movie-list',
        manifest: null,
        activeDeployment: {manifest: {title: 'Deployed Title'}},
      }),
    )
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    renderHook(() => useWindowTitle())

    await waitFor(() => {
      expect(document.title).toBe('Deployed Title')
    })
  })

  it('should fall back to system title when no manifest title exists', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createContextResponse({
        type: 'application',
        title: 'sdk-movie-list',
        manifest: null,
        activeDeployment: null,
      }),
    )
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    renderHook(() => useWindowTitle())

    await waitFor(() => {
      expect(document.title).toBe('sdk-movie-list')
    })
  })

  it('should prepend view title when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createContextResponse({
        type: 'application',
        title: 'sdk-movie-list',
        manifest: {title: 'Movie List App'},
      }),
    )
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    renderHook(() => useWindowTitle('Movies'))

    await waitFor(() => {
      expect(document.title).toBe('Movies | Movie List App')
    })
  })

  it('should update when view title changes', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createContextResponse({
        type: 'application',
        title: 'sdk-movie-list',
        manifest: {title: 'Movie List App'},
      }),
    )
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    const {rerender} = renderHook(({viewTitle}) => useWindowTitle(viewTitle), {
      initialProps: {viewTitle: 'Movies'},
    })

    await waitFor(() => {
      expect(document.title).toBe('Movies | Movie List App')
    })

    rerender({viewTitle: 'Movie Details'})

    await waitFor(() => {
      expect(document.title).toBe('Movie Details | Movie List App')
    })
  })

  it('should restore the previous title on unmount', async () => {
    document.title = 'Previous Title'

    const mockFetch = vi.fn().mockResolvedValue(
      createContextResponse({
        type: 'application',
        title: 'sdk-movie-list',
        manifest: {title: 'Movie List App'},
      }),
    )
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    const {unmount} = renderHook(() => useWindowTitle('Movies'))

    await waitFor(() => {
      expect(document.title).toBe('Movies | Movie List App')
    })

    unmount()

    expect(document.title).toBe('Previous Title')
  })

  it('should handle AbortError silently', async () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    const mockFetch = vi.fn().mockRejectedValue(abortError)
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    renderHook(() => useWindowTitle())

    await waitFor(() => {
      expect(document.title).toBe('')
    })
  })

  it('should log non-abort fetch errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection failed'))
    vi.mocked(useWindowConnection).mockReturnValue({
      fetch: mockFetch,
      sendMessage: vi.fn(),
    })

    renderHook(() => useWindowTitle('Movies'))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch app title from dashboard context:',
        expect.any(Error),
      )
    })

    consoleSpy.mockRestore()
  })
})
