import {type FavoriteStatusResponse, setFavorite} from '@sanity/sdk'
import {installMessageBus, type MutationResult, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost, type MessageBusMessage, type PayloadOf} from '@sanity/sdk/dashboard'
import {act, waitFor} from '@testing-library/react'
import {type ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
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
    let error: unknown

    await act(async () => {
      try {
        await result.current.favorite()
      } catch (caughtError) {
        error = caughtError
      }
    })

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('mutate failed')
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

describe('useUpdateFavorite (message bus)', () => {
  const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
  const handle = {documentId: 'doc', documentType: 'movie', resourceType: 'studio' as const}

  let host: MessageBusHost

  // Holds the update so a test decides when the host replies.
  const captureUpdates = () => {
    const updates: MessageBusMessage<PayloadOf<'favorites.update'>, void>[] = []
    host.subscribe('favorites.update', (message) => void updates.push(message))
    return updates
  }

  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('emits favorites.update and stays pending until the host replies', async () => {
    const updates = captureUpdates()
    const {result} = renderHook(() => useUpdateFavorite(handle))

    let pending!: Promise<FavoriteStatusResponse>
    act(() => {
      pending = result.current.unfavorite()
    })
    expect(result.current.isPending).toBe(true)
    expect(updates.map((message) => message.payload)).toStrictEqual([
      {
        document: {
          id: 'doc',
          type: 'movie',
          resource: {id: 'test.test', type: 'dataset'},
        },
        favorited: false,
      },
    ])

    await act(async () => {
      updates[0].reply()
      await expect(pending).resolves.toEqual({isFavorited: false})
    })
    expect(result.current.isPending).toBe(false)
    expect(setFavorite).not.toHaveBeenCalled()
  })

  it('passes a non-studio resource type through unmapped', async () => {
    const updates = captureUpdates()
    const {result} = renderHook(() =>
      useUpdateFavorite({...handle, resourceType: 'media-library', resourceId: 'library'}),
    )

    act(() => void result.current.favorite())

    expect(updates[0].payload.document.resource).toStrictEqual({
      id: 'library',
      type: 'media-library',
    })
    await act(async () => updates[0].reply())
  })

  it('rejects right away when no host answers favorites.update', async () => {
    const {result} = renderHook(() => useUpdateFavorite(handle))

    await act(async () => {
      await expect(result.current.favorite()).rejects.toMatchObject({code: 'NO_RESPONDER'})
    })

    expect(result.current.isPending).toBe(false)
    expect(result.current.error).toMatchObject({code: 'NO_RESPONDER'})
  })

  it('rejects when the host refuses the update', async () => {
    host.subscribe('favorites.update', (message) => message.reject('no favorites'))
    const {result} = renderHook(() => useUpdateFavorite(handle))

    await act(async () => {
      await expect(result.current.favorite()).rejects.toThrow('no favorites')
    })

    expect((result.current.error as Error).message).toContain('no favorites')
  })
})
