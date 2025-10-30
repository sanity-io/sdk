import {deleteAsset} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useDeleteAsset} from './useDeleteAsset'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    deleteAsset: vi.fn(),
  }
})

describe('useDeleteAsset', () => {
  it('calls deleteAsset with the asset document id', async () => {
    vi.mocked(deleteAsset).mockResolvedValue(undefined)

    const {result} = renderHook(() => useDeleteAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    await result.current('image-abc-1x1-png')

    expect(deleteAsset).toHaveBeenCalledWith(
      expect.objectContaining({config: expect.objectContaining({projectId: 'p'})}),
      'image-abc-1x1-png',
    )
  })

  it('propagates errors from delete', async () => {
    vi.mocked(deleteAsset).mockRejectedValue(new Error('nope'))

    const {result} = renderHook(() => useDeleteAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    await expect(result.current('file-1')).rejects.toThrow('nope')
  })

  it('returns new function when instance changes', () => {
    const {result, unmount} = renderHook(() => useDeleteAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p1" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    const first = result.current
    unmount()

    const {result: result2} = renderHook(() => useDeleteAsset(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p2" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    expect(result2.current).not.toBe(first)
  })
})
