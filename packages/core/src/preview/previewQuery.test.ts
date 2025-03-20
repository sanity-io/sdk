import {describe, expect, it} from 'vitest'

import {SUBTITLE_CANDIDATES, TITLE_CANDIDATES} from './previewConstants'
import {createPreviewQuery, normalizeMedia, processPreviewQuery} from './previewQuery'
import {STABLE_EMPTY_PREVIEW} from './util'

describe('createPreviewQuery', () => {
  it('creates a query and params for given ids and schema', () => {
    const ids = new Set(['book1', 'book2'])
    const {query, params} = createPreviewQuery(ids)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(1)
  })
})

describe('processPreviewQuery', () => {
  it('returns STABLE_EMPTY_PREVIEW if documentType is missing', () => {
    const ids = new Set(['doc1'])
    const result = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      results: [],
      ids,
    })

    expect(result['doc1']).toEqual(STABLE_EMPTY_PREVIEW)
  })

  it('returns STABLE_EMPTY_PREVIEW if no candidates found', () => {
    const ids = new Set(['doc1'])
    const result = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      results: [], // no results, so no selectResult
      ids,
    })

    expect(result['doc1']).toEqual(STABLE_EMPTY_PREVIEW)
  })

  // it.only('returns STABLE_ERROR_PREVIEW if an error occurs', () => {
  //   const ids = new Set(['doc1'])
  //   const result = processPreviewQuery({
  //     projectId: 'p',
  //     dataset: 'd',
  //     results: [
  //       {
  //         _id: 'doc1',
  //         _type: 'someType',
  //         _updatedAt: new Date().toISOString(),
  //         titleCandidates: {title: null},
  //         subtitleCandidates: {subtitle: null},
  //       },
  //     ], // no results, so no selectResult
  //     ids,
  //   })

  //   expect(result['doc1']).toEqual(STABLE_ERROR_PREVIEW)
  // })

  it('processes query results into preview values', () => {
    const results = [
      {
        _id: 'person1',
        _type: 'person',
        _updatedAt: '2021-01-01',
        titleCandidates: {title: 'John'},
        subtitleCandidates: {subtitle: null},
      },
    ]

    const processed = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['person1']),
      results,
    })

    const val = processed['person1']
    expect(val?.data).toEqual({
      title: 'John',
      media: null,
      status: {lastEditedPublishedAt: '2021-01-01'},
    })
    expect(val?.isPending).toBe(false)
  })

  it('resolves status preferring draft over published when available', () => {
    const results = [
      {
        _id: 'drafts.article1',
        _type: 'article',
        _updatedAt: '2023-12-16T12:00:00Z',
        titleCandidates: {
          title: 'Draft Title',
          name: null,
        },
        subtitleCandidates: {
          title: null,
          name: null,
        },
      },
      {
        _id: 'article1',
        _type: 'article',
        _updatedAt: '2023-12-15T12:00:00Z',
        titleCandidates: {
          title: 'Published Title',
          name: null,
        },
        subtitleCandidates: {
          title: null,
          name: null,
        },
      },
    ]

    const processed = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['article1']),
      results,
    })

    const val = processed['article1']
    expect(val?.data).toEqual({
      title: 'Draft Title',
      media: null,
      status: {
        lastEditedDraftAt: '2023-12-16T12:00:00Z',
        lastEditedPublishedAt: '2023-12-15T12:00:00Z',
      },
    })
    expect(val?.isPending).toBe(false)
  })

  it('uses the first defined title or subtitle from the candidates', () => {
    const titleCandidates = {
      title: 'Draft Title',
      name: 'Draft Name',
      label: 'Draft Label',
      heading: 'Draft Heading',
      header: 'Draft Header',
      caption: 'Draft Caption',
    }

    const subtitleCandidates = {
      subtitle: 'Draft Subtitle',
      description: 'Draft Description',
      name: 'Draft Name',
      label: 'Draft Label',
      heading: 'Draft Heading',
      header: 'Draft Header',
      caption: 'Draft Caption',
    }

    const results = [
      {
        _id: 'article1',
        _type: 'article',
        _updatedAt: '2023-12-15T12:00:00Z',
        titleCandidates,
        subtitleCandidates,
      },
    ]

    const processed = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['article1']),
      results,
    })

    const val = processed['article1']
    expect(val?.data).toEqual({
      title: titleCandidates[TITLE_CANDIDATES[0] as keyof typeof titleCandidates],
      subtitle: subtitleCandidates[SUBTITLE_CANDIDATES[0] as keyof typeof subtitleCandidates],
      media: null,
      status: {lastEditedPublishedAt: '2023-12-15T12:00:00Z'},
    })
    expect(val?.isPending).toBe(false)
  })
})

describe('normalizeMedia', () => {
  it('returns null if media is null or undefined', () => {
    expect(normalizeMedia(null, 'projectId', 'dataset')).toBeNull()
    expect(normalizeMedia(undefined, 'projectId', 'dataset')).toBeNull()
  })

  it('returns null if media does not have a valid asset', () => {
    const invalidMedia1 = {media: {_ref: 'image-abc123-200x200-png'}} // Missing `asset` property
    const invalidMedia2 = {asset: {ref: 'image-abc123-200x200-png'}} // Incorrect property name `ref`
    expect(normalizeMedia(invalidMedia1, 'projectId', 'dataset')).toBeNull()
    expect(normalizeMedia(invalidMedia2, 'projectId', 'dataset')).toBeNull()
  })

  it('returns null if media is not an object', () => {
    expect(normalizeMedia(123, 'projectId', 'dataset')).toBeNull()
    expect(normalizeMedia('invalid', 'projectId', 'dataset')).toBeNull()
  })

  it('returns a normalized URL for valid image asset objects', () => {
    const validMedia = {type: 'image-asset', _ref: 'image-abc123-200x200-png'}
    const result = normalizeMedia(validMedia, 'projectId', 'dataset')
    expect(result).toEqual({
      type: 'image-asset',
      _ref: 'image-abc123-200x200-png',
      url: 'https://cdn.sanity.io/images/projectId/dataset/abc123-200x200.png',
    })
  })

  it('throws an error for invalid asset IDs in the media', () => {
    const invalidMedia = {type: 'image-asset', _ref: 'invalid-asset-id'}
    expect(() => normalizeMedia(invalidMedia, 'projectId', 'dataset')).toThrow(
      'Invalid asset ID `invalid-asset-id`. Expected: image-{assetName}-{width}x{height}-{format}',
    )
  })

  it('handles image assets with expected URL format', () => {
    const media = {type: 'image-asset', _ref: 'image-xyz456-400x400-jpg'}
    const result = normalizeMedia(media, 'projectId', 'dataset')
    expect(result).toEqual({
      type: 'image-asset',
      _ref: 'image-xyz456-400x400-jpg',
      url: 'https://cdn.sanity.io/images/projectId/dataset/xyz456-400x400.jpg',
    })
  })

  it('ensures assetIdToUrl throws for asset IDs with missing groups', () => {
    const invalidMedia = {type: 'image-asset', _ref: 'image-missinggroups'}
    expect(() => normalizeMedia(invalidMedia, 'projectId', 'dataset')).toThrow(
      'Invalid asset ID `image-missinggroups`. Expected: image-{assetName}-{width}x{height}-{format}',
    )
  })
})
