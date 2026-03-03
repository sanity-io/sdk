import {DocumentId} from '@sanity/id-utils'
import {describe, expect, it} from 'vitest'

import {createProjectionQuery, processProjectionQuery} from './projectionQuery'

describe('createProjectionQuery', () => {
  it('creates a query and params for given ids and projections', () => {
    const ids = new Set(['doc1', 'doc2'].map(DocumentId))
    const projectionHash = '{title, description}'
    const documentProjections = {
      doc1: {[projectionHash]: projectionHash},
      doc2: {[projectionHash]: projectionHash},
    }

    const {query, params} = createProjectionQuery(ids, documentProjections)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(1)
    expect(params[`__ids_${projectionHash}`]).toBeDefined()
    expect(params[`__ids_${projectionHash}`]).toHaveLength(2)
  })

  it('handles multiple different projections', () => {
    const ids = new Set(['doc1', 'doc2'].map(DocumentId))
    const projectionHash1 = '{title, description}'
    const projectionHash2 = '{name, age}'
    const documentProjections = {
      doc1: {[projectionHash1]: projectionHash1},
      doc2: {[projectionHash2]: projectionHash2},
    }

    const {query, params} = createProjectionQuery(ids, documentProjections)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(2)
    expect(params[`__ids_${projectionHash1}`]).toBeDefined()
    expect(params[`__ids_${projectionHash1}`]).toHaveLength(1)
    expect(params[`__ids_${projectionHash2}`]).toBeDefined()
    expect(params[`__ids_${projectionHash2}`]).toHaveLength(1)
  })

  it('filters out ids without projections', () => {
    const ids = new Set(['doc1', 'doc2', 'doc3'].map(DocumentId))
    const projectionHash1 = '{title}'
    // projectionHash2 missing intentionally
    const projectionHash3 = '{name}'

    const documentProjections = {
      doc1: {[projectionHash1]: projectionHash1},
      doc3: {[projectionHash3]: projectionHash3},
    }

    const {query, params} = createProjectionQuery(ids, documentProjections)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(2)
    expect(params[`__ids_${projectionHash1}`]).toBeDefined()
    expect(params[`__ids_${projectionHash1}`]).toHaveLength(1)
    expect(params[`__ids_${projectionHash3}`]).toBeDefined()
    expect(params[`__ids_${projectionHash3}`]).toHaveLength(1)
  })
})

describe('processProjectionQuery', () => {
  const testProjectionHash = '{...}'

  it('returns structure with empty object if no results found', () => {
    const ids = new Set(['doc1'])
    const result = processProjectionQuery({
      ids,
      results: [], // no results
      perspective: 'published',
    })

    expect(result['doc1']).toEqual({})
  })

  it('returns structure with isPending:false and null data for ids with no results', () => {
    const ids = new Set(['doc1', 'doc2'])
    const results = [
      {
        _id: 'doc1',
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Hello', description: 'World'},
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      ids,
      results,
      perspective: 'published',
      documentStatuses: {
        doc1: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
    })

    expect(processed['doc1']?.[testProjectionHash]).toEqual({
      data: {
        title: 'Hello',
        description: 'World',
        _status: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
      isPending: false,
    })
    expect(processed['doc2']).toEqual({})
  })

  it('processes query results into projection values', () => {
    const results = [
      {
        _id: 'doc1',
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Hello', description: 'World'},
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      ids: new Set(['doc1']),
      results,
      perspective: 'published',
      documentStatuses: {
        doc1: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
    })

    expect(processed['doc1']?.[testProjectionHash]).toEqual({
      data: {
        title: 'Hello',
        description: 'World',
        _status: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
      isPending: false,
    })
  })

  it('handles release perspective with all three status fields', () => {
    const results = [
      {
        _id: 'doc1',
        _type: 'document',
        _updatedAt: '2021-01-03',
        result: {title: 'Version'},
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      ids: new Set(['doc1']),
      results,
      perspective: {releaseName: 'release1'},
      documentStatuses: {
        doc1: {
          lastEditedDraftAt: '2021-01-02',
          lastEditedPublishedAt: '2021-01-01',
          lastEditedVersionAt: '2021-01-03',
        },
      },
    })

    expect(processed['doc1']?.[testProjectionHash]).toEqual({
      data: {
        title: 'Version',
        _status: {
          lastEditedDraftAt: '2021-01-02',
          lastEditedPublishedAt: '2021-01-01',
          lastEditedVersionAt: '2021-01-03',
        },
      },
      isPending: false,
    })
  })

  it('handles multiple projections for the same document', () => {
    const hash1 = '{title}'
    const hash2 = '{description}'
    const results = [
      {
        _id: 'doc1',
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Published Title'},
        __projectionHash: hash1,
      },
      {
        _id: 'doc1',
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {description: 'Published Desc'},
        __projectionHash: hash2,
      },
    ]

    const processed = processProjectionQuery({
      ids: new Set(['doc1']),
      results,
      perspective: 'published',
      documentStatuses: {
        doc1: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
    })

    expect(processed['doc1']?.[hash1]).toEqual({
      data: {
        title: 'Published Title',
        _status: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
      isPending: false,
    })
    expect(processed['doc1']?.[hash2]).toEqual({
      data: {
        description: 'Published Desc',
        _status: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
      isPending: false,
    })
  })
})
