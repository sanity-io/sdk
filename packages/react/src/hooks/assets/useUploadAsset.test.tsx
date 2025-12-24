import {type SanityAssetDocument, type SanityImageAssetDocument} from '@sanity/client'
import {uploadAsset} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useUploadAsset} from './useUploadAsset'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    uploadAsset: vi.fn(),
  }
})

describe('useUploadAsset', () => {
  it('returns a function and uploads image assets', async () => {
    const uploaded = {
      _id: 'image-abc-1x1-png',
      _type: 'sanity.imageAsset',
      assetId: 'abc',
      extension: 'png',
      size: 1,
      url: 'u',
      path: 'p',
      mimeType: 'image/png',
    } as unknown as SanityImageAssetDocument
    vi.mocked(uploadAsset).mockResolvedValue(uploaded)

    const {result} = renderHook(() => useUploadAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    const fn = result.current
    const body = Buffer.from('x')
    const res = await fn('image', body, {filename: 'a.png'})
    expect(res).toBe(uploaded)
    expect(uploadAsset).toHaveBeenCalledWith(
      expect.objectContaining({config: expect.objectContaining({projectId: 'p'})}),
      'image',
      body,
      {filename: 'a.png'},
    )
  })

  it('uploads file assets and forwards options', async () => {
    const uploaded = {
      _id: 'file-abc',
      _type: 'sanity.fileAsset',
      assetId: 'abc',
      extension: 'pdf',
      size: 10,
      url: 'u',
      path: 'p',
      mimeType: 'application/pdf',
    } as unknown as SanityAssetDocument
    vi.mocked(uploadAsset).mockResolvedValue(uploaded)

    const {result} = renderHook(() => useUploadAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    const out = await result.current('file', Buffer.from('f'), {title: 'T'})
    expect(out).toBe(uploaded)
    expect(uploadAsset).toHaveBeenCalledWith(
      expect.objectContaining({config: expect.objectContaining({projectId: 'p'})}),
      'file',
      expect.any(Buffer),
      {title: 'T'},
    )
  })

  it('propagates errors from upload', async () => {
    const err = new Error('boom')
    vi.mocked(uploadAsset).mockRejectedValue(err)

    const {result} = renderHook(() => useUploadAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    await expect(result.current('image', Buffer.from('x'))).rejects.toThrow('boom')
  })

  it('returns new function when instance changes (cleanup/remount)', async () => {
    vi.mocked(uploadAsset).mockResolvedValue({} as SanityImageAssetDocument)

    const {result, unmount} = renderHook(() => useUploadAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p1" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    const first = result.current
    unmount()

    const {result: result2} = renderHook(() => useUploadAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p2" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    expect(result2.current).not.toBe(first)
  })
})
