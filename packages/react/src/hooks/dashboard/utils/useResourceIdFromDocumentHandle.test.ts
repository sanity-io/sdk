import {describe, expect, it} from 'vitest'

import {renderHook} from '../../../../test/test-utils'
import {useResourceIdFromDocumentHandle} from './useResourceIdFromDocumentHandle'

describe('getResourceIdFromDocumentHandle', () => {
  describe('with traditional DocumentHandle (projectId/dataset)', () => {
    it('should return resource ID from projectId and dataset', () => {
      const documentHandle = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        projectId: 'test-project-id',
        dataset: 'test-dataset',
      }

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'test-project-id.test-dataset',
        type: undefined,
      })
    })
  })

  describe('with DocumentHandleWithSource - media library', () => {
    it('should return media library ID and resourceType when media library resource is provided', () => {
      const documentHandle = {
        documentId: 'test-asset-id',
        documentType: 'sanity.asset',
        resourceName: 'media-library',
      } as const

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'media-library-id',
        type: 'media-library',
      })
    })

    it('should prioritize resource over projectId/dataset when both are provided', () => {
      const documentHandle = {
        documentId: 'test-asset-id',
        documentType: 'sanity.asset',
        projectId: 'test-project-id',
        dataset: 'test-dataset',
        resourceName: 'media-library',
      }

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'media-library-id',
        type: 'media-library',
      })
    })
  })

  describe('with DocumentHandleWithSource - canvas', () => {
    it('should return canvas ID and resourceType when canvas resource is provided', () => {
      const documentHandle = {
        documentId: 'test-canvas-document-id',
        documentType: 'sanity.canvas.document',
        resourceName: 'canvas',
      }

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'canvas-id',
        type: 'canvas',
      })
    })
  })

  describe('with DocumentHandleWithSource - dataset resource', () => {
    it('should return dataset resource ID when dataset resource is provided', () => {
      const documentHandle = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        resourceName: 'dataset',
      }

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'resource-project-id.resource-dataset',
        type: undefined,
      })
    })

    it('should use dataset resource over projectId/dataset when both are provided', () => {
      const documentHandle = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        projectId: 'test-project-id',
        dataset: 'test-dataset',
        resourceName: 'dataset',
      }

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'resource-project-id.resource-dataset',
        type: undefined,
      })
    })
  })

  describe('edge cases', () => {
    it('should handle DocumentHandleWithSource with undefined resource', () => {
      const documentHandle = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        projectId: 'test-project-id',
        dataset: 'test-dataset',
        resourceName: undefined,
      }

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'test-project-id.test-dataset',
        type: undefined,
      })
    })
  })
})
