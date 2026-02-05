import {beforeEach, describe, expect, it, vi} from 'vitest'

import {resolveProjection} from '../projection/resolveProjection'
import {type ProjectionValuePending} from '../projection/types'
import {createSanityInstance} from '../store/createSanityInstance'
import {resolvePreview} from './resolvePreview'
import {type PreviewQueryResult} from './types'

vi.mock('../projection/resolveProjection')

describe('resolvePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves and transforms projection result to preview format', async () => {
    const mockProjectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'article',
      _updatedAt: '2024-01-01',
      titleCandidates: {title: 'Resolved Title'},
      subtitleCandidates: {description: 'Resolved Description'},
      media: null,
    }

    vi.mocked(resolveProjection).mockResolvedValue({
      data: mockProjectionResult,
      isPending: false,
    } as ProjectionValuePending<PreviewQueryResult>)

    const instance = createSanityInstance({
      projectId: 'test-project',
      dataset: 'test-dataset',
    })

    const result = await resolvePreview(instance, {
      documentId: 'doc1',
      documentType: 'article',
    })

    expect(result.data).toEqual({
      title: 'Resolved Title',
      subtitle: 'Resolved Description',
      media: null,
    })
    expect(result.isPending).toBe(false)
  })

  it('returns null data when projection resolves with null', async () => {
    vi.mocked(resolveProjection).mockResolvedValue({
      data: null,
      isPending: false,
    })

    const instance = createSanityInstance({
      projectId: 'test-project',
      dataset: 'test-dataset',
    })

    const result = await resolvePreview(instance, {
      documentId: 'doc1',
      documentType: 'article',
    })

    expect(result.data).toBeNull()
    expect(result.isPending).toBe(false)
  })
})
