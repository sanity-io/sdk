import {DocumentId, getVersionId} from '@sanity/id-utils'
import {describe, expect, it} from 'vitest'

import {buildStatusQueryIds, processStatusQueryResults} from './statusQuery'

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
