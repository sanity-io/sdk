import {
  datasetSource,
  type DocumentHandle,
  type DocumentSource,
  mediaLibrarySource,
} from '@sanity/sdk'
import {describe, expect, it} from 'vitest'

import {type DocumentHandleWithSource} from '../types'
import {getResourceIdFromDocumentHandle} from './getResourceIdFromDocumentHandle'

describe('getResourceIdFromDocumentHandle', () => {
  describe('with traditional DocumentHandle (projectId/dataset)', () => {
    it('should return resource ID from projectId and dataset', () => {
      const documentHandle: DocumentHandle = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        projectId: 'test-project-id',
        dataset: 'test-dataset',
      }

      const result = getResourceIdFromDocumentHandle(documentHandle)

      expect(result).toEqual({
        id: 'test-project-id.test-dataset',
        type: undefined,
      })
    })
  })

  describe('with DocumentHandleWithSource - media library', () => {
    it('should return media library ID and resourceType when media library source is provided', () => {
      const documentHandle: DocumentHandleWithSource = {
        documentId: 'test-asset-id',
        documentType: 'sanity.asset',
        source: mediaLibrarySource('mlPGY7BEqt52'),
      }

      const result = getResourceIdFromDocumentHandle(documentHandle)

      expect(result).toEqual({
        id: 'mlPGY7BEqt52',
        type: 'mediaLibrary',
      })
    })

    it('should prioritize source over projectId/dataset when both are provided', () => {
      const documentHandle: DocumentHandleWithSource = {
        documentId: 'test-asset-id',
        documentType: 'sanity.asset',
        projectId: 'test-project-id',
        dataset: 'test-dataset',
        source: mediaLibrarySource('mlPGY7BEqt52'),
      }

      const result = getResourceIdFromDocumentHandle(documentHandle)

      expect(result).toEqual({
        id: 'mlPGY7BEqt52',
        type: 'mediaLibrary',
      })
    })
  })

  describe('with DocumentHandleWithSource - dataset source', () => {
    it('should return dataset resource ID when dataset source is provided', () => {
      const documentHandle: DocumentHandleWithSource = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        source: datasetSource('source-project-id', 'source-dataset'),
      }

      const result = getResourceIdFromDocumentHandle(documentHandle)

      expect(result).toEqual({
        id: 'source-project-id.source-dataset',
        type: undefined,
      })
    })

    it('should use dataset source over projectId/dataset when both are provided', () => {
      const documentHandle: DocumentHandleWithSource = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        projectId: 'test-project-id',
        dataset: 'test-dataset',
        source: datasetSource('source-project-id', 'source-dataset'),
      }

      const result = getResourceIdFromDocumentHandle(documentHandle)

      expect(result).toEqual({
        id: 'source-project-id.source-dataset',
        type: undefined,
      })
    })
  })

  describe('edge cases', () => {
    it('should handle DocumentHandleWithSource with undefined source', () => {
      const documentHandle: DocumentHandleWithSource = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        projectId: 'test-project-id',
        dataset: 'test-dataset',
        source: undefined,
      }

      const result = getResourceIdFromDocumentHandle(documentHandle)

      expect(result).toEqual({
        id: 'test-project-id.test-dataset',
        type: undefined,
      })
    })

    it('should fall back to projectId/dataset when source is not recognized', () => {
      const documentHandle: DocumentHandleWithSource = {
        documentId: 'test-document-id',
        documentType: 'test-document-type',
        projectId: 'test-project-id',
        dataset: 'test-dataset',
        source: {
          __sanity_internal_sourceId: 'unknown-format',
        } as unknown as DocumentSource,
      }

      const result = getResourceIdFromDocumentHandle(documentHandle)

      // Falls back to projectId.dataset when source format is not recognized
      expect(result).toEqual({
        id: 'test-project-id.test-dataset',
        type: undefined,
      })
    })
  })
})
