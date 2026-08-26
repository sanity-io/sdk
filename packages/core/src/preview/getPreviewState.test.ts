import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getProjectionState} from '../projection/getProjectionState'
import {type ProjectionValuePending} from '../projection/types'
import {createSanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getPreviewState} from './getPreviewState'
import {type PreviewQueryResult} from './types'

vi.mock('../projection/getProjectionState')

describe('getPreviewState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('transforms projection result to preview format', () => {
    const mockProjectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'article',
      _updatedAt: '2024-01-01',
      titleCandidates: {title: 'Test Title'},
      subtitleCandidates: {description: 'Test Description'},
      media: null,
    }

    const mockProjectionState = {
      getCurrent: vi.fn().mockReturnValue({
        data: mockProjectionResult,
        isPending: false,
      } as ProjectionValuePending<PreviewQueryResult>),
      subscribe: vi.fn(),
      observable: of({
        data: mockProjectionResult,
        isPending: false,
      } as ProjectionValuePending<PreviewQueryResult>),
    }

    vi.mocked(getProjectionState).mockReturnValue(
      mockProjectionState as unknown as StateSource<
        ProjectionValuePending<Record<string, unknown>> | undefined
      >,
    )

    const instance = createSanityInstance({
      projectId: 'test-project',
      dataset: 'test-dataset',
    })
    const previewState = getPreviewState(instance, {
      documentId: 'doc1',
      documentType: 'article',
    })

    const result = previewState.getCurrent()

    expect(result.data).toEqual({
      title: 'Test Title',
      subtitle: 'Test Description',
      media: null,
    })
    expect(result.isPending).toBe(false)
  })

  it('returns null data when projection result is null', () => {
    const mockProjectionState = {
      getCurrent: vi.fn().mockReturnValue({
        data: null,
        isPending: true,
      }),
      subscribe: vi.fn(),
      observable: of({data: null, isPending: true}),
    }

    vi.mocked(getProjectionState).mockReturnValue(mockProjectionState)

    const instance = createSanityInstance({
      projectId: 'test-project',
      dataset: 'test-dataset',
    })
    const previewState = getPreviewState(instance, {
      documentId: 'doc1',
      documentType: 'article',
    })

    const result = previewState.getCurrent()

    expect(result.data).toBeNull()
    expect(result.isPending).toBe(true)
  })

  it('uses fallback title when no title candidates exist', () => {
    const mockProjectionResult: PreviewQueryResult = {
      _id: 'doc1',
      _type: 'article',
      _updatedAt: '2024-01-01',
      titleCandidates: {},
      subtitleCandidates: {},
      media: null,
    }

    const mockProjectionState = {
      getCurrent: vi.fn().mockReturnValue({
        data: mockProjectionResult,
        isPending: false,
      } as ProjectionValuePending<PreviewQueryResult>),
      subscribe: vi.fn(),
      observable: of({
        data: mockProjectionResult,
        isPending: false,
      } as ProjectionValuePending<PreviewQueryResult>),
    }

    vi.mocked(getProjectionState).mockReturnValue(
      mockProjectionState as unknown as StateSource<
        ProjectionValuePending<Record<string, unknown>> | undefined
      >,
    )

    const instance = createSanityInstance({
      projectId: 'test-project',
      dataset: 'test-dataset',
    })
    const previewState = getPreviewState(instance, {
      documentId: 'doc1',
      documentType: 'article',
    })

    const result = previewState.getCurrent()

    expect(result.data).toEqual({
      title: 'article: doc1',
      subtitle: undefined,
      media: null,
    })
  })
})
