import {linkMediaLibraryAsset, type SanityDocument} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useLinkMediaLibraryAsset} from './useLinkMediaLibraryAsset'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    linkMediaLibraryAsset: vi.fn(),
  }
})

describe('useLinkMediaLibraryAsset', () => {
  it('calls linkMediaLibraryAsset with provided options', async () => {
    vi.mocked(linkMediaLibraryAsset).mockResolvedValue({
      _id: 'doc',
      _type: 'any',
    } as unknown as SanityDocument)

    const {result} = renderHook(() => useLinkMediaLibraryAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    const out = await result.current({
      assetId: 'a',
      mediaLibraryId: 'm',
      assetInstanceId: 'i',
      tag: 't',
    })

    expect(out).toEqual({_id: 'doc', _type: 'any'})
    expect(linkMediaLibraryAsset).toHaveBeenCalledWith(
      expect.objectContaining({config: expect.objectContaining({projectId: 'p'})}),
      {assetId: 'a', mediaLibraryId: 'm', assetInstanceId: 'i', tag: 't'},
    )
  })

  it('propagates errors from link operation', async () => {
    vi.mocked(linkMediaLibraryAsset).mockRejectedValue(new Error('fail'))

    const {result} = renderHook(() => useLinkMediaLibraryAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    await expect(
      result.current({assetId: 'a', mediaLibraryId: 'm', assetInstanceId: 'i'}),
    ).rejects.toThrow('fail')
  })

  it('returns new function when instance changes', () => {
    const {result, unmount} = renderHook(() => useLinkMediaLibraryAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p1" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    const first = result.current
    unmount()

    const {result: result2} = renderHook(() => useLinkMediaLibraryAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p2" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    expect(result2.current).not.toBe(first)
  })
})
