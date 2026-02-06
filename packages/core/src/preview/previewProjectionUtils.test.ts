import {type SanityClient} from '@sanity/client'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {normalizeMedia, transformProjectionToPreview} from './previewProjectionUtils'
import {type PreviewQueryResult} from './types'

// Mock the getClient function
vi.mock('../client/clientStore', () => ({
  getClient: vi.fn(),
}))

const mockClient = {
  config: () => ({projectId: 'test-project', dataset: 'test-dataset'}),
} as unknown as SanityClient

describe('normalizeMedia', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('returns null if media is null or undefined', () => {
    expect(normalizeMedia(null, mockClient)).toBeNull()
    expect(normalizeMedia(undefined, mockClient)).toBeNull()
  })

  it('returns null if media does not have a valid asset', () => {
    const invalidMedia1 = {media: {_ref: 'image-abc123-200x200-png'}} // Missing `asset` property
    const invalidMedia2 = {asset: {ref: 'image-abc123-200x200-png'}} // Incorrect property name `ref`
    expect(normalizeMedia(invalidMedia1, mockClient)).toBeNull()
    expect(normalizeMedia(invalidMedia2, mockClient)).toBeNull()
  })

  it('returns null if media is not an object', () => {
    expect(normalizeMedia(123, mockClient)).toBeNull()
    expect(normalizeMedia('invalid', mockClient)).toBeNull()
  })

  it('returns a normalized URL for valid image asset objects', () => {
    const validMedia = {type: 'image-asset', _ref: 'image-abc123-200x200-png'}
    const result = normalizeMedia(validMedia, mockClient)
    expect(result).toEqual({
      type: 'image-asset',
      _ref: 'image-abc123-200x200-png',
      url: 'https://cdn.sanity.io/images/test-project/test-dataset/abc123-200x200.png',
    })
  })

  it('handles image assets with expected URL format', () => {
    const media = {type: 'image-asset', _ref: 'image-xyz456-400x400-jpg'}
    const result = normalizeMedia(media, mockClient)
    expect(result).toEqual({
      type: 'image-asset',
      _ref: 'image-xyz456-400x400-jpg',
      url: 'https://cdn.sanity.io/images/test-project/test-dataset/xyz456-400x400.jpg',
    })
  })
})

describe('transformProjectionToPreview', () => {
  const instance = createSanityInstance({
    projectId: 'test-project',
    dataset: 'test-dataset',
  })

  beforeEach(async () => {
    vi.clearAllMocks()

    // Mock getClient to return our mock client
    const {getClient} = await import('../client/clientStore')
    vi.mocked(getClient).mockReturnValue(mockClient)
  })

  it('transforms projection result with title and subtitle', () => {
    const projectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'article',
      _updatedAt: '2026-01-01',
      titleCandidates: {title: 'My Title'},
      subtitleCandidates: {description: 'My Description'},
      media: null,
    }

    const result = transformProjectionToPreview(instance, projectionResult)

    expect(result).toEqual({
      title: 'My Title',
      subtitle: 'My Description',
      media: null,
    })
  })

  it('uses fallback title when no title candidates exist', () => {
    const projectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'article',
      _updatedAt: '2026-01-01',
      titleCandidates: {},
      subtitleCandidates: {},
      media: null,
    }

    const result = transformProjectionToPreview(instance, projectionResult)

    expect(result.title).toBe('article: doc1')
    expect(result.subtitle).toBeUndefined()
  })

  it('transforms projection result with media', () => {
    const projectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'article',
      _updatedAt: '2026-01-01',
      titleCandidates: {title: 'My Title'},
      subtitleCandidates: {},
      media: {type: 'image-asset', _ref: 'image-abc123-200x200-png', url: ''},
    }

    const result = transformProjectionToPreview(instance, projectionResult)

    expect(result).toEqual({
      title: 'My Title',
      subtitle: undefined,
      media: {
        type: 'image-asset',
        _ref: 'image-abc123-200x200-png',
        url: 'https://cdn.sanity.io/images/test-project/test-dataset/abc123-200x200.png',
      },
    })
  })

  it('includes status when provided', () => {
    const projectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'article',
      _updatedAt: '2026-01-01',
      titleCandidates: {title: 'My Title'},
      subtitleCandidates: {},
      media: null,
      _status: {
        lastEditedPublishedAt: '2026-01-01',
        lastEditedDraftAt: '2026-01-02',
      },
    }

    const result = transformProjectionToPreview(instance, projectionResult)

    expect(result).toEqual({
      title: 'My Title',
      subtitle: undefined,
      media: null,
      _status: {
        lastEditedPublishedAt: '2026-01-01',
        lastEditedDraftAt: '2026-01-02',
      },
    })
  })

  it('calls getClient with the provided source', async () => {
    const projectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'article',
      _updatedAt: '2026-01-01',
      titleCandidates: {title: 'My Title'},
      subtitleCandidates: {},
      media: null,
    }

    const source = {mediaLibraryId: 'test-library'}

    transformProjectionToPreview(instance, projectionResult, source)

    const {getClient} = await import('../client/clientStore')
    expect(getClient).toHaveBeenCalledWith(instance, {
      apiVersion: 'v2025-05-06',
      source,
    })
  })
})
