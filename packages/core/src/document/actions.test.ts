import {at, patch, set, setIfMissing} from '@sanity/mutate'
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
const dummyDocString = {_id: 'drafts.abc123', _type: 'testType'}

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
        patches: [dummyPatch],
      })
    })

    it('creates an edit action from a document handle', () => {
      const action = editDocument(dummyDocHandle, dummyPatch)
      expect(action).toEqual({
        type: 'document.edit',
        documentId: 'abc123',
        patches: [dummyPatch],
      })
    })

    it('allows @sanity/mutate-style patches', () => {
      const action = editDocument(
        patch(
          dummyDocString._id,
          [
            at('published', set(true)),
            at('address', setIfMissing({_type: 'address'})),
            at('address.city', set('Oslo')),
          ],
          {ifRevision: 'txn0'},
        ),
      )

      expect(action).toEqual({
        documentId: 'drafts.abc123',
        patches: [
          {ifRevisionID: 'txn0', set: {published: true}},
          {ifRevisionID: 'txn0', setIfMissing: {address: {_type: 'address'}}},
          {ifRevisionID: 'txn0', set: {'address.city': 'Oslo'}},
        ],
        type: 'document.edit',
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
