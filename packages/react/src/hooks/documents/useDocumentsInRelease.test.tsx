import {type DatasetHandle} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {useDocumentsInRelease} from './useDocumentsInRelease'

vi.mock('./useDocuments', () => ({
  useDocuments: vi.fn(() => ({
    data: [],
    hasMore: false,
    count: 0,
    isPending: false,
    loadMore: () => {},
  })),
}))

describe('useDocumentsInRelease', () => {
  const mockDatasetHandle: DatasetHandle = {
    projectId: 'test-project',
    dataset: 'test-dataset',
  }

  it('should render without errors with valid options', () => {
    const options: DatasetHandle = {
      ...mockDatasetHandle,
      perspective: {
        releaseName: 'test-release',
      },
    }

    const {result} = renderHook(() => useDocumentsInRelease(options))
    expect(result.current).toBeDefined()
  })

  it('should throw error with invalid release perspective', () => {
    const options = {
      ...mockDatasetHandle,
      perspective: {},
    } as unknown as DatasetHandle

    expect(() => {
      renderHook(() => useDocumentsInRelease(options))
    }).toThrow('useDocumentsInRelease requires a valid ReleasePerspective')
  })

  it('should throw error with null release perspective', () => {
    const options = {
      ...mockDatasetHandle,
      releasePerspective: null,
    }

    expect(() => {
      renderHook(() => useDocumentsInRelease(options))
    }).toThrow('useDocumentsInRelease requires a valid ReleasePerspective')
  })

  it('should throw error with undefined release perspective', () => {
    const options = {
      ...mockDatasetHandle,
      releasePerspective: undefined,
    }

    expect(() => {
      renderHook(() => useDocumentsInRelease(options))
    }).toThrow('useDocumentsInRelease requires a valid ReleasePerspective')
  })
})
