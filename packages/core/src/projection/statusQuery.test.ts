import {DocumentId, getVersionId} from '@sanity/id-utils'
import {describe, expect, it} from 'vitest'

import {buildStatusQuery, buildStatusQueryIds, processStatusQueryResults} from './statusQuery'

describe('buildStatusQueryIds', () => {
  it('includes draft and published ids only when perspective is not a release', () => {
    const ids = new Set(['doc1'].map(DocumentId))
    const result = buildStatusQueryIds(ids, 'published')
    expect(result).toContain('drafts.doc1')
    expect(result).toContain('doc1')
    expect(result).toHaveLength(2)
  })

  it('includes version ids when perspective is a release', () => {
    const ids = new Set(['doc1'].map(DocumentId))
    const perspective = {releaseName: 'myRelease'}
    const result = buildStatusQueryIds(ids, perspective)
    expect(result).toContain('drafts.doc1')
    expect(result).toContain('doc1')
    expect(result).toContain(getVersionId(DocumentId('doc1'), 'myRelease'))
    expect(result).toHaveLength(3)
  })
})

describe('processStatusQueryResults', () => {
  it('sets lastEditedVersionAt when result _id is a version id', () => {
    const versionId = getVersionId(DocumentId('doc1'), 'myRelease')
    const results = [{_id: versionId, _updatedAt: '2025-01-01T12:00:00Z'}]
    const documentStatuses = processStatusQueryResults(results)
    expect(documentStatuses['doc1']).toEqual({
      lastEditedVersionAt: '2025-01-01T12:00:00Z',
    })
  })
})

describe('buildStatusQuery', () => {
  it('names documents by id when there is no variant', () => {
    const {query, params} = buildStatusQuery(new Set(['doc1']), 'drafts', undefined)
    expect(query).toBe('*[_id in $statusIds]{_id, _updatedAt}')
    expect(params).toEqual({statusIds: ['drafts.doc1', 'doc1']})
  })

  it('selects variant documents through _system when a variant is set', () => {
    const {query, params} = buildStatusQuery(new Set(['doc1', 'drafts.doc2']), 'drafts', 'french')
    expect(query).toContain('_system.variant._ref == $variantRef')
    expect(query).toContain('"bundleId": _system.bundleId')
    expect(params).toEqual({variantRef: '_.variants.french', groupIds: ['doc1', 'doc2']})
  })
})

describe('processStatusQueryResults with variant results', () => {
  const groupId = 'doc1'
  it('classifies variant documents by their bundle rather than their id', () => {
    const results = [
      {_id: `versions.h1.${groupId}`, _updatedAt: '2025-01-01T00:00:00Z', bundleId: null},
      {_id: `versions.h2.${groupId}`, _updatedAt: '2025-01-02T00:00:00Z', bundleId: 'drafts'},
      {_id: `versions.h3.${groupId}`, _updatedAt: '2025-01-03T00:00:00Z', bundleId: 'summer'},
    ]
    expect(processStatusQueryResults(results, {releaseName: 'summer'}, 'french')[groupId]).toEqual({
      lastEditedPublishedAt: '2025-01-01T00:00:00Z',
      lastEditedDraftAt: '2025-01-02T00:00:00Z',
      lastEditedVersionAt: '2025-01-03T00:00:00Z',
    })
  })

  it('treats a null bundleId as the published bundle', () => {
    const results = [
      {_id: `versions.h1.${groupId}`, _updatedAt: '2025-01-01T00:00:00Z', bundleId: null},
    ]
    expect(processStatusQueryResults(results, 'drafts', 'french')[groupId]).toEqual({
      lastEditedPublishedAt: '2025-01-01T00:00:00Z',
    })
  })

  it('ignores variants over releases outside the perspective', () => {
    const results = [
      {_id: `versions.h3.${groupId}`, _updatedAt: '2025-01-03T00:00:00Z', bundleId: 'winter'},
    ]
    expect(processStatusQueryResults(results, {releaseName: 'summer'}, 'french')[groupId]).toEqual(
      {},
    )
  })
})
