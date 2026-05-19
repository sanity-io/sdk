import {type ReleaseDocument} from '@sanity/client'
import {at, patch, set, setIfMissing} from '@sanity/mutate'
import {type PatchOperations} from '@sanity/types'
import {describe, expect, it} from 'vitest'

import {type DocumentHandle, type ReleaseHandle} from '../config/sanityConfig'
import {
  archiveRelease,
  createDocument,
  createRelease,
  deleteDocument,
  deleteRelease,
  discardDocument,
  editDocument,
  editRelease,
  publishDocument,
  publishRelease,
  scheduleRelease,
  unarchiveRelease,
  unpublishDocument,
  unscheduleRelease,
} from '../document/actions'

const dummyPatch: PatchOperations = {
  diffMatchPatch: {'dummy.path': 'dummy patch'},
}

const dummyDocHandle: DocumentHandle = {documentId: 'drafts.abc123', documentType: 'testType'}
const dummyDocString = {documentId: 'drafts.abc123', documentType: 'testType'}

const dummyReleaseHandle: ReleaseHandle = {releaseId: 'my-release'}
const dummyReleasePatch: PatchOperations = {set: {'metadata.title': 'Updated title'}}

describe('document actions', () => {
  describe('createDocument', () => {
    it('creates a document action from a document handle', () => {
      const action = createDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.create',
        // getId returns the input if it does not end with a dot.
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
      })
    })

    it('creates a document action from a document type handle', () => {
      // A document type handle is similar to a document handle,
      // but _id is optional.
      const typeHandle = {documentId: 'abc456', documentType: 'anotherType'}
      const action = createDocument(typeHandle)
      expect(action).toEqual({
        type: 'document.create',
        documentId: 'abc456',
        documentType: typeHandle.documentType,
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
      })
    })

    it('creates a document action without initialValue when not provided', () => {
      const action = createDocument(dummyDocHandle, undefined)
      expect(action).toEqual({
        type: 'document.create',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
      })
    })

    it('creates a document action with empty initialValue object', () => {
      const action = createDocument(dummyDocHandle, {})
      expect(action).toEqual({
        type: 'document.create',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        initialValue: {},
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
      })
    })

    it('creates a delete action from a document handle', () => {
      const action = deleteDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.delete',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
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
      })
    })

    it('creates an edit action from a document handle', () => {
      const action = editDocument(dummyDocHandle, dummyPatch)
      expect(action).toEqual({
        type: 'document.edit',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
        patches: [dummyPatch],
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
      })
    })

    it('creates a publish action from a document handle', () => {
      const action = publishDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.publish',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
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
      })
    })

    it('creates an unpublish action from a document handle', () => {
      const action = unpublishDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.unpublish',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
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
      })
    })

    it('creates a discard action from a document handle', () => {
      const action = discardDocument(dummyDocHandle)
      expect(action).toEqual({
        type: 'document.discard',
        documentId: 'abc123',
        documentType: dummyDocHandle.documentType,
      })
    })
  })
})

describe('release actions', () => {
  describe('createRelease', () => {
    it('creates a release action from a release handle', () => {
      const action = createRelease(dummyReleaseHandle)
      expect(action).toEqual({
        type: 'release.create',
        releaseId: 'my-release',
        metadata: {releaseType: 'undecided'},
      })
    })

    it('creates a release action with metadata', () => {
      const metadata: ReleaseDocument['metadata'] = {
        title: 'My release',
        description: 'Some description',
        releaseType: 'scheduled',
        intendedPublishAt: '2026-01-01T00:00:00.000Z',
      }
      const action = createRelease(dummyReleaseHandle, metadata)
      expect(action).toEqual({
        type: 'release.create',
        releaseId: 'my-release',
        metadata,
      })
    })

    it('preserves resource fields from the handle', () => {
      const action = createRelease({
        releaseId: 'my-release',
        resource: {dataset: 'production', projectId: 'abc123'},
      })
      expect(action).toEqual({
        type: 'release.create',
        releaseId: 'my-release',
        resource: {dataset: 'production', projectId: 'abc123'},
        metadata: {releaseType: 'undecided'},
      })
    })
  })

  describe('editRelease', () => {
    it('creates a release.edit action with a patch', () => {
      const action = editRelease(dummyReleaseHandle, dummyReleasePatch)
      expect(action).toEqual({
        type: 'release.edit',
        releaseId: 'my-release',
        patch: dummyReleasePatch,
      })
    })
  })

  describe('publishRelease', () => {
    it('creates a release.publish action from a release handle', () => {
      const action = publishRelease(dummyReleaseHandle)
      expect(action).toEqual({type: 'release.publish', releaseId: 'my-release'})
    })
  })

  describe('scheduleRelease', () => {
    it('creates a release.schedule action with publishAt', () => {
      const publishAt = '2026-01-01T00:00:00.000Z'
      const action = scheduleRelease(dummyReleaseHandle, publishAt)
      expect(action).toEqual({
        type: 'release.schedule',
        releaseId: 'my-release',
        publishAt,
      })
    })
  })

  describe('unscheduleRelease', () => {
    it('creates a release.unschedule action from a release handle', () => {
      const action = unscheduleRelease(dummyReleaseHandle)
      expect(action).toEqual({type: 'release.unschedule', releaseId: 'my-release'})
    })
  })

  describe('archiveRelease', () => {
    it('creates a release.archive action from a release handle', () => {
      const action = archiveRelease(dummyReleaseHandle)
      expect(action).toEqual({type: 'release.archive', releaseId: 'my-release'})
    })
  })

  describe('unarchiveRelease', () => {
    it('creates a release.unarchive action from a release handle', () => {
      const action = unarchiveRelease(dummyReleaseHandle)
      expect(action).toEqual({type: 'release.unarchive', releaseId: 'my-release'})
    })
  })

  describe('deleteRelease', () => {
    it('creates a release.delete action from a release handle', () => {
      const action = deleteRelease(dummyReleaseHandle)
      expect(action).toEqual({type: 'release.delete', releaseId: 'my-release'})
    })
  })
})
