import {describe, expect, it} from 'vitest'

import {renderHook} from '../../../../test/test-utils'
import {useResourceIdFromDocumentHandle} from './useResourceIdFromDocumentHandle'

describe('getResourceIdFromDocumentHandle', () => {
  describe('with DocumentHandle using resource object', () => {
    it('should return resource ID from resource object with projectId and dataset', () => {
      const documentHandle = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        resource: {projectId: 'test-project-id', dataset: 'test-dataset'},
      }

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'test-project-id.test-dataset',
        type: undefined,
      })
    })
  })

  describe('with DocumentHandle - media library resource', () => {
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

    it('should use resourceName when provided', () => {
      const documentHandle = {
        documentId: 'test-asset-id',
        documentType: 'sanity.asset',
        resourceName: 'media-library',
      }

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'media-library-id',
        type: 'media-library',
      })
    })
  })

  describe('with DocumentHandle - canvas resource', () => {
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

  describe('with DocumentHandle - dataset resource', () => {
    it('should return dataset resource ID when dataset resource is provided', () => {
      const documentHandle = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        resourceName: 'dataset',
      }

      const {result} = renderHook(() => useResourceIdFromDocumentHandle(documentHandle))

      expect(result.current).toEqual({
        id: 'source-project-id.source-dataset',
        type: undefined,
      })
    })
  })

  describe('edge cases', () => {
    it('should handle DocumentHandle with explicit resource and no resourceName', () => {
      const documentHandle = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        resource: {projectId: 'test-project-id', dataset: 'test-dataset'},
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
