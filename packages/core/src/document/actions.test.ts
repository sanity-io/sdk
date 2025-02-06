// tests/documentActions.test.ts
import {type PatchOperations} from '@sanity/types'
import {describe, expect, it} from 'vitest'

import {
  createDocument,
  deleteDocument,
  discardDocument,
  editDocument,
  publishDocument,
  unpublishDocument,
} from '../document/actions'
import {type DocumentHandle} from './patchOperations'

const dummyPatch: PatchOperations = {
  diffMatchPatch: {'dummy.path': 'dummy patch'},
}

const dummyDocHandle: DocumentHandle = {_id: 'drafts.abc123', _type: 'testType'}
const dummyDocString = 'drafts.abc123'

describe('document actions', () => {
  describe('createDocument', () => {
    it('creates a document action from a document handle', () => {
      const action = createDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.create',
        // getId returns the input if it does not end with a dot.
        documentId: dummyDocHandle._id,
        documentType: dummyDocHandle._type,
      })
    })

    it('creates a document action from a document type handle', () => {
      // A document type handle is similar to a document handle,
      // but _id is optional.
      const typeHandle = {_id: 'abc456', _type: 'anotherType'}
      const action = createDocument(typeHandle)
      expect(action).toEqual({
        type: 'document.create',
        documentId: typeHandle._id,
        documentType: typeHandle._type,
      })
    })
  })

  describe('deleteDocument', () => {
    it('creates a delete action from a string id', () => {
      const action = deleteDocument(dummyDocString)
      // getPublishedId removes "drafts." prefix.
      expect(action).toEqual({
        type: 'document.delete',
        documentId: 'abc123',
      })
    })

    it('creates a delete action from a document handle', () => {
      const action = deleteDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.delete',
        documentId: 'abc123',
      })
    })
  })

  describe('editDocument', () => {
    it('creates an edit action from a string id', () => {
      const action = editDocument(dummyDocString, dummyPatch)
      expect(action).toEqual({
        type: 'document.edit',
        documentId: 'abc123',
        patch: dummyPatch,
      })
    })

    it('creates an edit action from a document handle', () => {
      const action = editDocument(dummyDocHandle, dummyPatch)
      expect(action).toEqual({
        type: 'document.edit',
        documentId: 'abc123',
        patch: dummyPatch,
      })
    })
  })

  describe('publishDocument', () => {
    it('creates a publish action from a string id', () => {
      const action = publishDocument(dummyDocString)
      expect(action).toEqual({
        type: 'document.publish',
        documentId: 'abc123',
      })
    })

    it('creates a publish action from a document handle', () => {
      const action = publishDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.publish',
        documentId: 'abc123',
      })
    })
  })

  describe('unpublishDocument', () => {
    it('creates an unpublish action from a string id', () => {
      const action = unpublishDocument(dummyDocString)
      expect(action).toEqual({
        type: 'document.unpublish',
        documentId: 'abc123',
      })
    })

    it('creates an unpublish action from a document handle', () => {
      const action = unpublishDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.unpublish',
        documentId: 'abc123',
      })
    })
  })

  describe('discardDocument', () => {
    it('creates a discard action from a string id', () => {
      const action = discardDocument(dummyDocString)
      expect(action).toEqual({
        type: 'document.discard',
        documentId: 'abc123',
      })
    })

    it('creates a discard action from a document handle', () => {
      const action = discardDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.discard',
        documentId: 'abc123',
      })
    })
  })
})
