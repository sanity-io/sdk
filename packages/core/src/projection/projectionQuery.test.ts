import {type DocumentId} from '@sanity/id-utils'
import {describe, expect, it} from 'vitest'

import {createProjectionQuery, processProjectionQuery} from './projectionQuery'
import {type ValidProjection} from './types'

describe('createProjectionQuery', () => {
  const ids = new Set(['doc1' as DocumentId, 'doc2' as DocumentId])
  const projectionHash: ValidProjection = '{title, description}'
  const documentProjections = {
    doc1: {[projectionHash]: projectionHash},
    doc2: {[projectionHash]: projectionHash},
  }
  const configs = {
    doc1: {[projectionHash]: {perspective: 'drafts'}},
    doc2: {[projectionHash]: {perspective: 'drafts'}},
  }

  it('creates a query and params for given ids and projections', () => {
    const {query, params} = createProjectionQuery(ids, documentProjections, configs)

    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(1)
    expect(params[`__ids_${projectionHash}`]).toBeDefined()
    expect(params[`__ids_${projectionHash}`]).toHaveLength(4)
  })

  it('handles multiple different projections', () => {
    const projectionHash2: ValidProjection = '{name, age}'
    const differentProjections = {
      ...documentProjections,
      doc2: {[projectionHash2]: projectionHash2},
    }
    const differentConfigs = {
      ...configs,
      doc2: {[projectionHash2]: {perspective: 'drafts'}},
    }

    const {query, params} = createProjectionQuery(ids, differentProjections, differentConfigs)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(2)
    expect(params[`__ids_${projectionHash}`]).toBeDefined()
    expect(params[`__ids_${projectionHash}`]).toHaveLength(2)
    expect(params[`__ids_${projectionHash2}`]).toBeDefined()
    expect(params[`__ids_${projectionHash2}`]).toHaveLength(2)
  })

  it('filters out ids without projections', () => {
    const idswithMissingProjections = new Set([
      'doc1' as DocumentId,
      'doc2' as DocumentId,
      'doc3' as DocumentId,
    ])
    const projectionHash1: ValidProjection = '{title}'
    // projectionHash2 missing intentionally
    const projectionHash3: ValidProjection = '{name}'

    const documentProjectionsWithMissingIds = {
      doc1: {[projectionHash1]: projectionHash1},
      doc3: {[projectionHash3]: projectionHash3},
    }

    const configsWithMissingIds = {
      doc1: {[projectionHash1]: {perspective: 'drafts'}},
      doc3: {[projectionHash3]: {perspective: 'drafts'}},
    }

    const {query, params} = createProjectionQuery(
      idswithMissingProjections,
      documentProjectionsWithMissingIds,
      configsWithMissingIds,
    )
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(2)
    expect(params[`__ids_${projectionHash1}`]).toBeDefined()
    expect(params[`__ids_${projectionHash1}`]).toHaveLength(2)
    expect(params[`__ids_${projectionHash3}`]).toBeDefined()
    expect(params[`__ids_${projectionHash3}`]).toHaveLength(2)
  })

  it('includes version IDs when using release perspective', () => {
    const releaseConfigs = {
      doc1: {
        [projectionHash]: {
          perspective: {
            releaseName: 'test-release',
          },
        },
      },
    }

    const {query, params} = createProjectionQuery(ids, documentProjections, releaseConfigs)

    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(1)
    expect(params[`__ids_${projectionHash}`]).toBeDefined()
    // Should include published, draft, and version IDs (3 total)
    expect(params[`__ids_${projectionHash}`]).toHaveLength(3)
    // Verify the version ID is included
    expect(params[`__ids_${projectionHash}`]).toContain('doc1')
    expect(params[`__ids_${projectionHash}`]).toContain('drafts.doc1')
    expect(params[`__ids_${projectionHash}`]).toContain('versions.test-release.doc1')
  })

  it('filters out documents that have projections but no configs', () => {
    const configsMissingDoc2 = {
      doc1: {[projectionHash]: {}},
      // doc2 config intentionally missing
    }

    const {query, params} = createProjectionQuery(ids, documentProjections, configsMissingDoc2)

    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(1)
    expect(params[`__ids_${projectionHash}`]).toBeDefined()
    // Should only include doc1's IDs (2 total - published and draft)
    expect(params[`__ids_${projectionHash}`]).toHaveLength(2)
    expect(params[`__ids_${projectionHash}`]).toContain('doc1')
    expect(params[`__ids_${projectionHash}`]).toContain('drafts.doc1')
    // doc2's IDs should not be included
    expect(params[`__ids_${projectionHash}`]).not.toContain('doc2')
    expect(params[`__ids_${projectionHash}`]).not.toContain('drafts.doc2')
  })
})

describe('processProjectionQuery', () => {
  const testProjectionHash = '{...}'

  it('returns structure with empty object if no results found', () => {
    const ids = new Set(['doc1' as DocumentId])
    const result = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids,
      results: [], // no results
    })

    expect(result['doc1']).toEqual({})
  })

  it('returns structure with isPending:false and null data for ids with no results', () => {
    const ids = new Set(['doc1' as DocumentId, 'doc2' as DocumentId])
    const results = [
      {
        _id: 'doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Hello', description: 'World'},
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids,
      results,
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
        _id: 'doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Hello', description: 'World'},
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1']),
      results,
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

  it('handles both draft and published documents', () => {
    const results = [
      {
        _id: 'drafts.doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-02',
        result: {title: 'Draft'},
        __projectionHash: testProjectionHash,
      },
      {
        _id: 'doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Published'},
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1' as DocumentId]),
      results,
    })

    expect(processed['doc1']?.[testProjectionHash]).toEqual({
      data: {
        title: 'Draft',
        _status: {
          lastEditedDraftAt: '2021-01-02',
          lastEditedPublishedAt: '2021-01-01',
        },
      },
      isPending: false,
    })
  })

  it('uses published result when no draft exists', () => {
    const results = [
      {
        _id: 'doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Published'},
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1' as DocumentId]),
      results,
    })

    expect(processed['doc1']?.[testProjectionHash]).toEqual({
      data: {
        title: 'Published',
        _status: {
          lastEditedPublishedAt: '2021-01-01',
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
        _id: 'doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Published Title'},
        __projectionHash: hash1,
      },
      {
        _id: 'doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {description: 'Published Desc'},
        __projectionHash: hash2,
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1']),
      results,
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

  it('filters out results for documents not in the requested IDs set', () => {
    const results = [
      {
        _id: 'doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Doc1 Title'},
        __projectionHash: testProjectionHash,
      },
      {
        _id: 'doc2' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Doc2 Title'},
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1']), // Only requesting doc1
      results,
    })

    // Should only include doc1 in the results
    expect(processed['doc1']).toBeDefined()
    expect(processed['doc2']).toBeUndefined()
    expect(processed['doc1']?.[testProjectionHash]).toEqual({
      data: {
        title: 'Doc1 Title',
        _status: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
      isPending: false,
    })
  })

  it('handles release version results and includes them in status', () => {
    const results = [
      {
        _id: 'versions.test-release.doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-03',
        result: {title: 'Release Version'},
        __projectionHash: testProjectionHash,
      },
      {
        _id: 'drafts.doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-02',
        result: {title: 'Draft Version'},
        __projectionHash: testProjectionHash,
      },
      {
        _id: 'doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Published Version'},
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1']),
      results,
    })

    expect(processed['doc1']?.[testProjectionHash]).toEqual({
      data: {
        title: 'Release Version',
        _status: {
          lastEditedReleaseVersionAt: '2021-01-03',
          lastEditedDraftAt: '2021-01-02',
          lastEditedPublishedAt: '2021-01-01',
        },
      },
      isPending: false,
    })
  })

  it('handles documents with no result data', () => {
    const results = [
      {
        _id: 'doc1' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {},
        __projectionHash: testProjectionHash,
      },
      {
        _id: 'doc2' as DocumentId,
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: null as unknown as Record<string, unknown>,
        __projectionHash: testProjectionHash,
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1', 'doc2']),
      results,
    })

    // doc1 should have a result
    expect(processed['doc1']?.[testProjectionHash]).toEqual({
      data: {
        _status: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
      isPending: false,
    })

    // doc2 should have no result data
    expect(processed['doc2']?.[testProjectionHash]).toEqual({
      data: null,
      isPending: false,
    })
  })
})
