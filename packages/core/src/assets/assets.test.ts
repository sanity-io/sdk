import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getClient, getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {
  type AssetDocumentBase,
  buildImageUrlFromId,
  deleteAsset,
  getAssetDownloadUrl,
  getAssetsState,
  isImageAssetId,
  linkMediaLibraryAsset,
  resolveAssets,
  uploadAsset,
} from './assets'

vi.mock('../client/clientStore', () => ({
  getClient: vi.fn(),
  getClientState: vi.fn(),
}))

describe('assets', () => {
  let instance: SanityInstance

  beforeEach(() => {
    vi.resetAllMocks()
    instance = createSanityInstance({projectId: 'proj', dataset: 'ds'})
  })

  it('isImageAssetId validates expected pattern', () => {
    expect(isImageAssetId('image-abc_123-800x600-jpg')).toBe(true)
    expect(isImageAssetId('image-someHash-1x2-png')).toBe(true)
    expect(isImageAssetId('image-abc-800-600-jpg')).toBe(false)
    expect(isImageAssetId('file-abc-800x600-jpg')).toBe(false)
    expect(isImageAssetId('image-abc-800x600-JPG')).toBe(false)
  })

  describe('buildImageUrlFromId', () => {
    it('builds a CDN URL from a valid asset id', () => {
      const url = buildImageUrlFromId(instance, 'image-somehash-1024x768-png')
      expect(url).toBe('https://cdn.sanity.io/images/proj/ds/somehash-1024x768.png')
    })

    it('supports explicit projectId/dataset overrides', () => {
      const url = buildImageUrlFromId(instance, 'image-x-10x20-webp', 'p2', 'd2')
      expect(url).toBe('https://cdn.sanity.io/images/p2/d2/x-10x20.webp')
    })

    it('throws for invalid asset id', () => {
      // @ts-expect-error - invalid asset id
      expect(() => buildImageUrlFromId(instance, 'image-x-10-20-webp')).toThrow(/Invalid asset ID/)
    })

    it('throws when projectId/dataset are missing', () => {
      const empty = createSanityInstance({})
      expect(() => buildImageUrlFromId(empty, 'image-x-1x1-png')).toThrow(
        /projectId and dataset are required/,
      )
      empty.dispose()
    })
  })

  describe('getAssetDownloadUrl', () => {
    it('appends dl param with empty value when filename omitted', () => {
      expect(getAssetDownloadUrl('https://cdn.sanity.io/file.png')).toBe(
        'https://cdn.sanity.io/file.png?dl=',
      )
    })

    it('appends dl param with encoded filename', () => {
      expect(getAssetDownloadUrl('https://cdn.sanity.io/file.png', 'nice name.png')).toBe(
        'https://cdn.sanity.io/file.png?dl=nice%20name.png',
      )
    })

    it('uses & when URL already has query parameters', () => {
      expect(getAssetDownloadUrl('https://cdn.sanity.io/file.png?w=100', 'x')).toBe(
        'https://cdn.sanity.io/file.png?w=100&dl=x',
      )
    })
  })

  describe('upload/delete asset', () => {
    it('uploadAsset forwards to client with mapped options and tag', async () => {
      const body = Buffer.from('data')
      const uploaded = {_id: 'image-abc-1x1-png', _type: 'sanity.imageAsset'}
      const upload = vi.fn().mockResolvedValue(uploaded)
      vi.mocked(getClient).mockReturnValue({
        assets: {upload},
      } as unknown as SanityClient)

      const result = await uploadAsset(instance, 'image', body, {
        filename: 'photo.png',
        contentType: 'image/png',
        meta: ['palette'],
        title: 't',
        description: 'd',
        label: 'l',
        creditLine: 'c',
        sourceName: 'ext',
        sourceId: '42',
        sourceUrl: 'https://example.com/asset/42',
      })

      expect(upload).toHaveBeenCalledTimes(1)
      expect(upload).toHaveBeenCalledWith(
        'image',
        body,
        expect.objectContaining({
          filename: 'photo.png',
          contentType: 'image/png',
          extract: ['palette'],
          title: 't',
          description: 'd',
          label: 'l',
          creditLine: 'c',
          tag: 'sdk.upload-asset',
          source: {
            name: 'ext',
            id: '42',
            url: 'https://example.com/asset/42',
          },
        }),
      )
      expect(result).toBe(uploaded)
    })

    it('uploadAsset omits source when incomplete', async () => {
      const body = Buffer.from('x')
      const upload = vi.fn().mockResolvedValue({_id: 'file-1', _type: 'sanity.fileAsset'})
      vi.mocked(getClient).mockReturnValue({assets: {upload}} as unknown as SanityClient)

      await uploadAsset(instance, 'file', body, {sourceName: 'ext'})

      const options = vi.mocked(upload).mock.calls[0][2]
      expect(options.source).toBeUndefined()
    })

    it('deleteAsset forwards to client.delete', async () => {
      const del = vi.fn().mockResolvedValue(undefined)
      vi.mocked(getClient).mockReturnValue({delete: del} as unknown as SanityClient)

      await deleteAsset(instance, 'image-abc-1x1-png')
      expect(del).toHaveBeenCalledWith('image-abc-1x1-png')
    })
  })

  describe('linkMediaLibraryAsset', () => {
    it('throws when projectId/dataset are missing', async () => {
      const empty = createSanityInstance({})
      await expect(
        linkMediaLibraryAsset(empty, {
          assetId: 'a',
          mediaLibraryId: 'm',
          assetInstanceId: 'i',
        }),
      ).rejects.toThrow(/projectId and dataset are required/)
      empty.dispose()
    })

    it('posts to media-library link endpoint with correct body', async () => {
      const request = vi.fn().mockResolvedValue({_id: 'linkedAsset', _type: 'sanity.fileAsset'})
      vi.mocked(getClient).mockReturnValue({request} as unknown as SanityClient)

      const doc = await linkMediaLibraryAsset(instance, {
        projectId: 'p1',
        dataset: 'd1',
        assetId: 'asset-1',
        mediaLibraryId: 'lib-1',
        assetInstanceId: 'inst-1',
        tag: 'custom-tag',
      })

      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: '/assets/media-library-link/d1',
          method: 'POST',
          tag: 'custom-tag',
          body: {
            assetId: 'asset-1',
            mediaLibraryId: 'lib-1',
            assetInstanceId: 'inst-1',
          },
        }),
      )
      expect(doc).toEqual({_id: 'linkedAsset', _type: 'sanity.fileAsset'})
    })
  })

  describe('assets integration', () => {
    it('resolveAssets fetches via client observable when configured', async () => {
      const data: AssetDocumentBase[] = [{_id: 'image-1', _type: 'sanity.imageAsset', url: 'u'}]
      const fetch = vi.fn().mockReturnValue(of({result: data, syncTags: []}))

      const fakeClient = {
        observable: {fetch},
        live: {events: vi.fn().mockReturnValue(of())},
        config: () => ({token: undefined}),
      } as unknown as SanityClient

      vi.mocked(getClientState).mockReturnValue({
        observable: of(fakeClient),
      } as StateSource<SanityClient>)

      const result = await resolveAssets(instance, {
        projectId: 'p',
        dataset: 'd',
        assetType: 'image',
        where: 'defined(url)',
        limit: 1,
        params: {x: 1},
        order: '_createdAt desc',
      })

      expect(fetch).toHaveBeenCalledTimes(1)
      const [groq, params, options] = vi.mocked(fetch).mock.calls[0]
      expect(typeof groq).toBe('string')
      expect(groq).toContain('sanity.imageAsset')
      expect(groq).toContain('defined(url)')
      expect(groq).toContain('order(_createdAt desc)')
      expect(groq).toContain('[0...1]')
      expect(params).toEqual({x: 1})
      expect(options).toEqual(expect.objectContaining({tag: 'sdk.assets'}))
      expect(result).toEqual(data)
    })

    it('getAssetsState throws without projectId/dataset', () => {
      const empty = createSanityInstance({})
      expect(() => getAssetsState(empty, {assetType: 'all'}).getCurrent()).toThrow(
        /projectId and dataset are required/,
      )
      empty.dispose()
    })
  })
})
