import {type FavoriteStatusResponse, setFavorite} from '@sanity/sdk'
import {type MutationResult} from '@sanity/sdk/_internal'
import {act, renderHook, waitFor} from '@testing-library/react'
import {type ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useUpdateFavorite} from './useUpdateFavorite'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    setFavorite: vi.fn(),
  }
})

type SetFavorite = typeof setFavorite

describe('useUpdateFavorite', () => {
  const mockSetFavorite = setFavorite as Mock

  const handle = {
    documentId: 'mock-id',
    documentType: 'mock-type',
    resourceType: 'studio' as const,
  }

  const makeWrapper = (projectId?: string, dataset?: string) => {
    return function Wrapper({children}: {children: ReactNode}) {
      return (
        <ResourceProvider projectId={projectId} dataset={dataset} fallback={null}>
          {children}
        </ResourceProvider>
      )
    }
  }
  const wrapper = makeWrapper('test', 'test')

  beforeEach(() => {
    mockSetFavorite.mockImplementation((async (_instance, input) => ({
      data: {isFavorited: input.isFavorited},
      invalidated: Promise.resolve(),
    })) as SetFavorite)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends the added event with the resolved studio resourceId', async () => {
    const {result} = renderHook(() => useUpdateFavorite(handle), {wrapper})

    await act(async () => {
      await result.current.favorite()
    })

    expect(setFavorite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 'mock-id',
        documentType: 'mock-type',
        resourceId: 'test.test',
        resourceType: 'studio',
        isFavorited: true,
      }),
    )
  })

  it('sends the removed event when unfavoriting', async () => {
    const {result} = renderHook(() => useUpdateFavorite(handle), {wrapper})

    await act(async () => {
      await result.current.unfavorite()
    })

    expect(setFavorite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({isFavorited: false}),
    )
  })

  it('passes schemaName through when provided', async () => {
    const {result} = renderHook(() => useUpdateFavorite({...handle, schemaName: 'testSchema'}), {
      wrapper,
    })

    await act(async () => {
      await result.current.favorite()
    })

    expect(setFavorite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({schemaName: 'testSchema', isFavorited: true}),
    )
  })

  it('tracks isPending across the mutation lifecycle', async () => {
    let resolveMutation!: (value: MutationResult<FavoriteStatusResponse>) => void
    mockSetFavorite.mockReturnValue(
      new Promise<MutationResult<FavoriteStatusResponse>>((resolve) => {
        resolveMutation = resolve
      }),
    )

    const {result} = renderHook(() => useUpdateFavorite(handle), {wrapper})
    expect(result.current.isPending).toBe(false)

    act(() => {
      void result.current.favorite()
    })
    expect(result.current.isPending).toBe(true)

    await act(async () => {
      resolveMutation({data: {isFavorited: true}, invalidated: Promise.resolve()})
    })
    expect(result.current.isPending).toBe(false)
  })

  it('surfaces mutation failures on error', async () => {
    mockSetFavorite.mockRejectedValue(new Error('mutate failed'))

    const {result} = renderHook(() => useUpdateFavorite(handle), {wrapper})

    await act(async () => {
      await expect(result.current.favorite()).rejects.toThrow('mutate failed')
    })

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
  })

  it('throws when a studio resource is missing projectId or dataset', () => {
    expect(() =>
      renderHook(() => useUpdateFavorite(handle), {wrapper: makeWrapper(undefined, undefined)}),
    ).toThrow('projectId and dataset are required for studio resources')
  })

  it('throws when resourceId is missing for non-studio resources', () => {
    expect(() =>
      renderHook(
        () => useUpdateFavorite({...handle, resourceType: 'media-library', resourceId: undefined}),
        {wrapper},
      ),
    ).toThrow('resourceId is required for media-library and canvas resources')
  })
})
