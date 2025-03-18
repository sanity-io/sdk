import {describe, expect, it} from 'vitest'

import {createProjectionQuery, processProjectionQuery} from './projectionQuery'

describe('createProjectionQuery', () => {
  it('creates a query and params for given ids and projections', () => {
    const ids = new Set(['doc1', 'doc2'])
    const documentProjections = {
      doc1: '{title, description}',
      doc2: '{title, description}',
    }

    const {query, params} = createProjectionQuery(ids, documentProjections)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(1)
  })

  it('handles multiple different projections', () => {
    const ids = new Set(['doc1', 'doc2'])
    const documentProjections = {
      doc1: '{title, description}',
      doc2: '{name, age}',
    }

    const {query, params} = createProjectionQuery(ids, documentProjections)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(2)
  })

  it('filters out ids without projections', () => {
    const ids = new Set(['doc1', 'doc2', 'doc3'])
    const documentProjections = {
      doc1: '{title}',
      // doc2 missing intentionally
      doc3: '{name}',
    }

    const {query, params} = createProjectionQuery(ids, documentProjections)
    expect(query).toMatch(/.*_id in \$__ids_.*/)
    expect(Object.keys(params)).toHaveLength(2)
  })
})

describe('processProjectionQuery', () => {
  it('returns null if no results found', () => {
    const ids = new Set(['doc1'])
    const result = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids,
      results: [], // no results
    })

    expect(result['doc1']).toEqual({data: null, isPending: false})
  })

  it('processes query results into projection values', () => {
    const results = [
      {
        _id: 'doc1',
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Hello', description: 'World'},
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1']),
      results,
    })

    expect(processed['doc1']).toEqual({
      data: {
        title: 'Hello',
        description: 'World',
        status: {
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
      },
      {
        _id: 'doc1',
        _type: 'document',
        _updatedAt: '2021-01-01',
        result: {title: 'Published'},
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1']),
      results,
    })

    expect(processed['doc1']).toEqual({
      data: {
        title: 'Draft',
        status: {
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
      },
    ]

    const processed = processProjectionQuery({
      projectId: 'p',
      dataset: 'd',
      ids: new Set(['doc1']),
      results,
    })

    expect(processed['doc1']).toEqual({
      data: {
        title: 'Published',
        status: {
          lastEditedPublishedAt: '2021-01-01',
        },
      },
      isPending: false,
    })
  })
})
