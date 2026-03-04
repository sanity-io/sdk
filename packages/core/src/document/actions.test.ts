import {at, patch, set, setIfMissing} from '@sanity/mutate'
import {type PatchOperations} from '@sanity/types'
import {describe, expect, it} from 'vitest'

import {type DocumentHandle, type DocumentResource} from '../config/sanityConfig'
import {
  createDocument,
  deleteDocument,
  discardDocument,
  editDocument,
  publishDocument,
  unpublishDocument,
} from '../document/actions'

const dummyPatch: PatchOperations = {
  diffMatchPatch: {'dummy.path': 'dummy patch'},
}
const dummyDocResource: DocumentResource = {projectId: 'test-project', dataset: 'test-dataset'}

const dummyDocHandle: DocumentHandle = {
  documentId: 'drafts.abc123',
  documentType: 'testType',
  resource: dummyDocResource,
}
const dummyDocString: DocumentHandle = {
  documentId: 'drafts.abc123',
  documentType: 'testType',
  resource: dummyDocResource,
}

describe('document actions', () => {
  describe('createDocument', () => {
    it('creates a document action from a document handle', () => {
      const action = createDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.create',
        // getId returns the input if it does not end with a dot.
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        resource: dummyDocResource,
      })
    })

    it('creates a document action from a document type handle', () => {
      // A document type handle is similar to a document handle,
      // but _id is optional.
      const typeHandle = {
        documentId: 'abc456',
        documentType: 'anotherType',
        resource: dummyDocResource,
      }
      const action = createDocument(typeHandle)
      expect(action).toEqual({
        type: 'document.create',
        documentId: 'abc456',
        documentType: typeHandle.documentType,
        resource: dummyDocResource,
      })
    })

    it('creates a document action with initial values', () => {
      const initialValue = {
        title: 'Test Title',
        author: 'John Doe',
        count: 42,
      }
      const action = createDocument(dummyDocHandle, initialValue)
      expect(action).toEqual({
        type: 'document.create',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        initialValue,
        resource: dummyDocResource,
      })
    })

    it('creates a document action without initialValue when not provided', () => {
      const action = createDocument(dummyDocHandle, undefined)
      expect(action).toEqual({
        type: 'document.create',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        resource: dummyDocResource,
      })
    })

    it('creates a document action with empty initialValue object', () => {
      const action = createDocument(dummyDocHandle, {})
      expect(action).toEqual({
        type: 'document.create',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        initialValue: {},
        resource: dummyDocResource,
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
        documentType: dummyDocString.documentType,
        resource: dummyDocResource,
      })
    })

    it('creates a delete action from a document handle', () => {
      const action = deleteDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.delete',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        resource: dummyDocResource,
      })
    })
  })

  describe('editDocument', () => {
    it('creates an edit action from a string id', () => {
      const action = editDocument(dummyDocString, dummyPatch)
      expect(action).toEqual({
        type: 'document.edit',
        documentId: 'abc123',
        documentType: dummyDocString.documentType,
        patches: [dummyPatch],
        resource: dummyDocResource,
      })
    })

    it('creates an edit action from a document handle', () => {
      const action = editDocument(dummyDocHandle, dummyPatch)
      expect(action).toEqual({
        type: 'document.edit',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        patches: [dummyPatch],
        resource: dummyDocResource,
      })
    })

    it('allows @sanity/mutate-style patches', () => {
      const action = editDocument(
        dummyDocHandle,
        patch(
          dummyDocHandle.documentId,
          [
            at('published', set(true)),
            at('address', setIfMissing({_type: 'address'})),
            at('address.city', set('Oslo')),
          ],
          {ifRevision: 'txn0'},
        ),
      )

      expect(action).toEqual({
        documentId: 'abc123',
        documentType: 'testType',
        patches: [
          {ifRevisionID: 'txn0', set: {published: true}},
          {ifRevisionID: 'txn0', setIfMissing: {address: {_type: 'address'}}},
          {ifRevisionID: 'txn0', set: {'address.city': 'Oslo'}},
        ],
        type: 'document.edit',
        resource: dummyDocResource,
      })
    })
  })

  describe('publishDocument', () => {
    it('creates a publish action from a string id', () => {
      const action = publishDocument(dummyDocString)
      expect(action).toEqual({
        type: 'document.publish',
        documentId: 'abc123',
        documentType: dummyDocString.documentType,
        resource: dummyDocResource,
      })
    })

    it('creates a publish action from a document handle', () => {
      const action = publishDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.publish',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        resource: dummyDocResource,
      })
    })
  })

  describe('unpublishDocument', () => {
    it('creates an unpublish action from a string id', () => {
      const action = unpublishDocument(dummyDocString)
      expect(action).toEqual({
        type: 'document.unpublish',
        documentId: 'abc123',
        documentType: dummyDocString.documentType,
        resource: dummyDocResource,
      })
    })

    it('creates an unpublish action from a document handle', () => {
      const action = unpublishDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.unpublish',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        resource: dummyDocResource,
      })
    })
  })

  describe('discardDocument', () => {
    it('creates a discard action from a string id', () => {
      const action = discardDocument(dummyDocString)
      expect(action).toEqual({
        type: 'document.discard',
        documentId: 'abc123',
        documentType: dummyDocString.documentType,
        resource: dummyDocResource,
      })
    })

    it('creates a discard action from a document handle', () => {
      const action = discardDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.discard',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        resource: dummyDocResource,
      })
    })
  })
})
