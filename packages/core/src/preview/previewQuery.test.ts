import {Schema as SchemaConstructor} from '@sanity/schema'
import {assert, describe, expect, it} from 'vitest'

import {
  createPreviewQuery,
  normalizeMedia,
  preparePreviewForSchemaType,
  processPreviewQuery,
} from './previewQuery'
import {STABLE_EMPTY_PREVIEW, STABLE_ERROR_PREVIEW} from './util'

describe('createPreviewQuery', () => {
  it('creates a query and params for given ids and schema', () => {
    const schema = SchemaConstructor.compile({
      name: 'default',
      types: [
        {
          name: 'book',
          type: 'document',
          fields: [
            {name: 'title', type: 'string'},
            {name: 'subtitle', type: 'string'},
          ],
          preview: {
            select: {
              title: 'title',
              subtitle: 'subtitle',
            },
          },
        },
      ],
    })

    const ids = new Set(['book1', 'book2'])
    const documentTypes = {book1: 'book', book2: 'book'}
    const {query, params} = createPreviewQuery(ids, documentTypes, schema)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(1)
  })
})

describe('processPreviewQuery', () => {
  it('returns STABLE_EMPTY_PREVIEW if documentType is missing', () => {
    // Schema with a single type but we won't reference it in `documentTypes` map
    const schema = SchemaConstructor.compile({
      name: 'testSchema',
      types: [
        {
          name: 'author',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
          preview: {
            select: {title: 'name'},
          },
        },
      ],
    })

    const ids = new Set(['doc1'])
    const result = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      schema,
      documentTypes: {}, // No doc1 mapping
      results: [],
      ids,
    })

    expect(result['doc1']).toEqual(STABLE_EMPTY_PREVIEW)
  })

  it('returns STABLE_EMPTY_PREVIEW if no selectResult found', () => {
    // Schema with a type that has a preview select
    const schema = SchemaConstructor.compile({
      name: 'testSchema',
      types: [
        {
          name: 'someType',
          type: 'document',
          fields: [{name: 'title', type: 'string'}],
          preview: {select: {title: 'title'}},
        },
      ],
    })

    const ids = new Set(['doc1'])
    const result = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      schema,
      documentTypes: {doc1: 'someType'},
      results: [], // no results, so no selectResult
      ids,
    })

    expect(result['doc1']).toEqual(STABLE_EMPTY_PREVIEW)
  })

  it('returns STABLE_ERROR_PREVIEW if an error occurs', () => {
    // Schema with a type that has a preview select
    const schema = SchemaConstructor.compile({
      name: 'testSchema',
      types: [
        {
          name: 'someType',
          type: 'document',
          fields: [{name: 'title', type: 'string'}],
          preview: {
            select: {title: 'title'},
            prepare: () => {
              throw new Error('test error')
            },
          },
        },
      ],
    })

    const ids = new Set(['doc1'])
    const result = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      schema,
      documentTypes: {doc1: 'someType'},
      results: [{_id: 'doc1', _type: 'someType', _updatedAt: new Date().toISOString(), select: {}}], // no results, so no selectResult
      ids,
    })

    expect(result['doc1']).toEqual(STABLE_ERROR_PREVIEW)
  })

  it('processes query results into preview values', () => {
    const schema = SchemaConstructor.compile({
      name: 'testSchema',
      types: [
        {
          name: 'person',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
          preview: {
            select: {title: 'name'},
          },
        },
      ],
    })

    const results = [
      {_id: 'person1', _type: 'person', _updatedAt: '2021-01-01', select: {title: 'John'}},
    ]

    const processed = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      documentTypes: {person1: 'person'},
      ids: new Set(['person1']),
      schema,
      results,
    })

    const val = processed['person1']
    assert(Array.isArray(val))
    expect(val[0]).toEqual({
      title: 'John',
      media: null,
      status: {lastEditedPublishedAt: '2021-01-01'},
    })
    expect(val[1]).toBe(false)
  })

  it('resolves status preferring draft over published when available', () => {
    const schema = SchemaConstructor.compile({
      name: 'testSchema',
      types: [
        {
          name: 'article',
          type: 'document',
          fields: [{name: 'title', type: 'string'}],
          preview: {select: {title: 'title'}},
        },
      ],
    })

    const results = [
      {
        _id: 'drafts.article1',
        _type: 'article',
        _updatedAt: '2023-12-16T12:00:00Z',
        select: {title: 'Draft Title'},
      },
      {
        _id: 'article1',
        _type: 'article',
        _updatedAt: '2023-12-15T12:00:00Z',
        select: {title: 'Published Title'},
      },
    ]

    const processed = processPreviewQuery({
      projectId: 'p',
      dataset: 'd',
      documentTypes: {article1: 'article'},
      ids: new Set(['article1']),
      schema,
      results,
    })

    const val = processed['article1']
    assert(Array.isArray(val))
    expect(val[0]).toEqual({
      title: 'Draft Title',
      media: null,
      status: {
        lastEditedDraftAt: '2023-12-16T12:00:00Z',
        lastEditedPublishedAt: '2023-12-15T12:00:00Z',
      },
    })
    expect(val[1]).toBe(false)
  })
})

describe('preparePreviewForSchemaType', () => {
  it('uses default prepare if none given', () => {
    const schema = SchemaConstructor.compile({
      name: 'testSchema',
      types: [
        {
          name: 'typeWithoutPrepare',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
          preview: {select: {title: 'name', subtitle: 'description'}},
        },
      ],
    })

    const val = preparePreviewForSchemaType({
      projectId: 'p',
      dataset: 'd',
      schema,
      schemaTypeName: 'typeWithoutPrepare',
      selectResult: {title: null, subtitle: 'Description'},
    })

    expect(val.title).toBe('Untitled')
    expect(val.subtitle).toBe('Description')
  })

  it('applies prepare function if defined', () => {
    const schema = SchemaConstructor.compile({
      name: 'testSchema',
      types: [
        {
          name: 'person',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
          preview: {
            select: {title: 'name', description: 'description'},
            prepare: (val: Record<string, string>) => ({
              title: val['title'].toUpperCase(),
              subtitle: val['description'].toUpperCase(),
            }),
          },
        },
      ],
    })

    const val = preparePreviewForSchemaType({
      projectId: 'p',
      dataset: 'd',
      schema,
      schemaTypeName: 'person',
      selectResult: {title: 'john', description: 'description'},
    })

    expect(val.title).toBe('JOHN')
    expect(val.subtitle).toBe('DESCRIPTION')
  })

  it('throws an error if schema type is missing', () => {
    const schema = SchemaConstructor.compile({
      name: 'testSchema',
      types: [
        {
          name: 'person',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
          preview: {select: {title: 'name'}},
        },
      ],
    })

    expect(() =>
      preparePreviewForSchemaType({
        projectId: 'p',
        dataset: 'd',
        schema,
        schemaTypeName: 'nonexistent',
        selectResult: {name: 'John'},
      }),
    ).toThrow('Could not find schema type `nonexistent` in schema `testSchema`.')
  })

  it('throws an unknown error message when error lacks a message property', () => {
    const schema = SchemaConstructor.compile({
      name: 'testSchema',
      types: [
        {
          name: 'person',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
          preview: {
            select: {title: 'name'},
            prepare: () => {
              throw {} // No message property
            },
          },
        },
      ],
    })

    expect(() =>
      preparePreviewForSchemaType({
        projectId: 'p',
        dataset: 'd',
        schema,
        schemaTypeName: 'person',
        selectResult: {name: 'John'},
      }),
    ).toThrow('Failed to prepare preview: Unknown error.')
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
    const validMedia = {asset: {_ref: 'image-abc123-200x200-png'}}
    const result = normalizeMedia(validMedia, 'projectId', 'dataset')
    expect(result).toEqual({
      type: 'image-asset',
      url: 'https://cdn.sanity.io/images/projectId/dataset/abc123-200x200.png',
    })
  })

  it('throws an error for invalid asset IDs in the media', () => {
    const invalidMedia = {asset: {_ref: 'invalid-asset-id'}}
    expect(() => normalizeMedia(invalidMedia, 'projectId', 'dataset')).toThrow(
      'Invalid asset ID `invalid-asset-id`. Expected: image-{assetName}-{width}x{height}-{format}',
    )
  })

  it('handles image assets with expected URL format', () => {
    const media = {asset: {_ref: 'image-xyz456-400x400-jpg'}}
    const result = normalizeMedia(media, 'projectId', 'dataset')
    expect(result).toEqual({
      type: 'image-asset',
      url: 'https://cdn.sanity.io/images/projectId/dataset/xyz456-400x400.jpg',
    })
  })

  it('ensures assetIdToUrl throws for asset IDs with missing groups', () => {
    const invalidMedia = {asset: {_ref: 'image-missinggroups'}}
    expect(() => normalizeMedia(invalidMedia, 'projectId', 'dataset')).toThrow(
      'Invalid asset ID `image-missinggroups`. Expected: image-{assetName}-{width}x{height}-{format}',
    )
  })
})

// describe('hasImageAsset', () => {
//   it('returns true for valid image asset objects', () => {
//     const validAsset = {asset: {_ref: 'image-abc123-200x200-png'}}
//     expect(hasImageAsset(validAsset)).toBe(true)
//   })

//   it('returns false for objects without asset property', () => {
//     const invalidAsset = {media: {_ref: 'image-abc123-200x200-png'}}
//     expect(hasImageAsset(invalidAsset)).toBe(false)
//   })

//   it('returns false for non-object inputs', () => {
//     expect(hasImageAsset(null)).toBe(false)
//     expect(hasImageAsset(undefined)).toBe(false)
//     expect(hasImageAsset('not an object')).toBe(false)
//     expect(hasImageAsset(123)).toBe(false)
//   })

//   it('returns false for objects with invalid asset structure', () => {
//     const invalidAsset = {asset: {ref: 'image-abc123-200x200-png'}} // `ref` instead of `_ref`
//     expect(hasImageAsset(invalidAsset)).toBe(false)
//   })
// })

// describe('assetIdToUrl', () => {
//   it('returns the correct URL for a valid asset ID', () => {
//     const url = assetIdToUrl('image-abc123-200x200-png', 'projectId', 'dataset')
//     expect(url).toBe('https://cdn.sanity.io/images/projectId/dataset/abc123-200x200.png')
//   })

//   it('throws an error for an invalid asset ID', () => {
//     expect(() => assetIdToUrl('invalid-asset-id', 'projectId', 'dataset')).toThrow(
//       'Invalid asset ID `invalid-asset-id`. Expected: image-{assetName}-{width}x{height}-{format}',
//     )
//   })

//   it('throws an error when required groups are missing in the asset ID', () => {
//     expect(() => assetIdToUrl('image-abc123', 'projectId', 'dataset')).toThrowError(
//       'Invalid asset ID `image-abc123`. Expected: image-{assetName}-{width}x{height}-{format}',
//     )
//   })
// })
