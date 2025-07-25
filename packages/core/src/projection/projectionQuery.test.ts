import {describe, expect, it} from 'vitest'

import {createProjectionQuery, processProjectionQuery} from './projectionQuery'
import {type ValidProjection} from './types'

describe('createProjectionQuery', () => {
  it('creates a query and params for given ids and projections', () => {
    const ids = new Set(['doc1', 'doc2'])
    const projectionHash: ValidProjection = '{title, description}'
    const documentProjections = {
      doc1: {[projectionHash]: projectionHash},
      doc2: {[projectionHash]: projectionHash},
    }

    const {query, params} = createProjectionQuery(ids, documentProjections)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(1)
    expect(params[`__ids_${projectionHash}`]).toBeDefined()
    expect(params[`__ids_${projectionHash}`]).toHaveLength(4)
  })

  it('handles multiple different projections', () => {
    const ids = new Set(['doc1', 'doc2'])
    const projectionHash1: ValidProjection = '{title, description}'
    const projectionHash2: ValidProjection = '{name, age}'
    const documentProjections = {
      doc1: {[projectionHash1]: projectionHash1},
      doc2: {[projectionHash2]: projectionHash2},
    }

    const {query, params} = createProjectionQuery(ids, documentProjections)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(2)
    expect(params[`__ids_${projectionHash1}`]).toBeDefined()
    expect(params[`__ids_${projectionHash1}`]).toHaveLength(2)
    expect(params[`__ids_${projectionHash2}`]).toBeDefined()
    expect(params[`__ids_${projectionHash2}`]).toHaveLength(2)
  })

  it('filters out ids without projections', () => {
    const ids = new Set(['doc1', 'doc2', 'doc3'])
    const projectionHash1: ValidProjection = '{title}'
    // projectionHash2 missing intentionally
    const projectionHash3: ValidProjection = '{name}'

    const documentProjections = {
      doc1: {[projectionHash1]: projectionHash1},
      doc3: {[projectionHash3]: projectionHash3},
    }

    const {query, params} = createProjectionQuery(ids, documentProjections)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(2)
    expect(params[`__ids_${projectionHash1}`]).toBeDefined()
    expect(params[`__ids_${projectionHash1}`]).toHaveLength(2)
    expect(params[`__ids_${projectionHash3}`]).toBeDefined()
    expect(params[`__ids_${projectionHash3}`]).toHaveLength(2)
  })
})

describe('processProjectionQuery', () => {
  const testProjectionHash = '{...}'

  it('returns structure with empty object if no results found', () => {
    const ids = new Set(['doc1'])
    const result = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids,
      results: [], // no results
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
        _id: 'doc1',
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
        _id: 'drafts.doc1',
        _type: 'document',
        _updatedAt: '2021-01-02',
        result: {title: 'Draft'},
        __projectionHash: testProjectionHash,
      },
      {
        _id: 'doc1',
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Published'},
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
        _id: 'doc1',
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Published'},
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
})
