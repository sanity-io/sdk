import {type SanityDocument} from '@sanity/types'
import {describe, expect, it} from 'vitest'

import {type DocumentAction} from './actions'
import {ActionError, processActions} from './processActions'
import {type DocumentSet} from './processMutations'

// Helper: Create a sample document that conforms to SanityDocument.
const createDoc = (id: string, title: string, rev: string = 'initial'): SanityDocument => ({
  _id: id,
  _type: 'article',
  _createdAt: '2025-01-01T00:00:00.000Z',
  _updatedAt: '2025-01-01T00:00:00.000Z',
  _rev: rev,
  title,
})

const transactionId = 'txn-123'
const timestamp = '2025-02-02T00:00:00.000Z'

describe('processActions', () => {
  describe('document.create', () => {
    it('should create a new draft document from a published document', () => {
      const published = createDoc('doc1', 'Original Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.create',
          documentType: 'article',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      const draftId = 'drafts.doc1'
      const draftDoc = result.working[draftId]
      expect(draftDoc).toBeDefined()
      expect(draftDoc?._id).toBe(draftId)
      expect(draftDoc?._type).toBe('article')
      expect(draftDoc?._rev).toBe(transactionId)
      // Should have copied over properties from the published version:
      expect(draftDoc?.['title']).toBe('Original Title')

      // Outgoing actions: note that attributes keep the original _rev from base.
      expect(result.outgoingActions).toEqual([
        {
          actionType: 'sanity.action.document.version.create',
          publishedId: 'doc1',
          attributes: {
            ...draftDoc,
            _rev: 'initial',
          },
        },
      ])

      // previousRevs come from initial working set
      expect(result.previousRevs).toEqual({doc1: 'initial'})
    })

    it('should throw an error if the draft already exists', () => {
      const draftDoc = createDoc('drafts.doc1', 'Draft Exists')
      const published = createDoc('doc1', 'Original Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {'doc1': published, 'drafts.doc1': draftDoc}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.create',
          documentType: 'article',
        },
      ]
      expect(() => processActions({actions, transactionId, base, working, timestamp})).toThrow(
        ActionError,
      )
    })

    it('should create a draft document using the working published version when base and working differ', () => {
      const publishedBase = createDoc('doc1', 'Original Title')
      const publishedWorking = createDoc('doc1', 'Working Title')
      const base: DocumentSet = {doc1: publishedBase}
      const working: DocumentSet = {doc1: publishedWorking}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.create',
          documentType: 'article',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      const draftId = 'drafts.doc1'
      const draftDoc = result.working[draftId]
      expect(draftDoc).toBeDefined()
      expect(draftDoc?._id).toBe(draftId)
      // Expect that the draft is built from the working version:
      expect(draftDoc?.['title']).toBe('Working Title')
    })
  })

  describe('document.delete', () => {
    it('should delete both published and draft documents when a draft exists', () => {
      const published = createDoc('doc1', 'Published Title')
      const draft = createDoc('drafts.doc1', 'Draft Title')
      const base: DocumentSet = {'doc1': published, 'drafts.doc1': draft}
      const working: DocumentSet = {'doc1': published, 'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.delete',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      // Both published and draft should be removed (set to null)
      expect(result.working['doc1']).toBeNull()
      expect(result.working['drafts.doc1']).toBeNull()

      expect(result.previousRevs).toEqual({'doc1': 'initial', 'drafts.doc1': 'initial'})

      // Outgoing action should include the draft since it was present
      expect(result.outgoingActions).toEqual([
        {
          actionType: 'sanity.action.document.delete',
          publishedId: 'doc1',
          includeDrafts: ['drafts.doc1'],
        },
      ])
    })

    it('should delete the published document and not include drafts if none exist', () => {
      const published = createDoc('doc1', 'Published Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.delete',
        },
      ]

      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      expect(result.working['doc1']).toBeNull()
      expect(result.working['drafts.doc1']).toBeNull()

      expect(result.outgoingActions).toEqual([
        {
          actionType: 'sanity.action.document.delete',
          publishedId: 'doc1',
        },
      ])
    })
  })

  describe('document.discard', () => {
    it('should discard a draft document', () => {
      const draft = createDoc('drafts.doc1', 'Draft Title', '1')
      const base: DocumentSet = {'drafts.doc1': draft}
      const working: DocumentSet = {'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.discard',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      expect(result.working['drafts.doc1']).toBeNull()
      expect(result.outgoingActions).toEqual([
        {
          actionType: 'sanity.action.document.version.discard',
          versionId: 'drafts.doc1',
        },
      ])
    })
  })

  describe('document.edit', () => {
    it('should edit a document when no draft exists, creating one from published', () => {
      const published = createDoc('doc1', 'Original Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.edit',
          patches: [{set: {title: 'Edited Title'}}],
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      const draftId = 'drafts.doc1'
      const editedDoc = result.working[draftId]
      expect(editedDoc).toBeDefined()
      expect(editedDoc?._id).toBe(draftId)
      expect(editedDoc?.['title']).toBe('Edited Title')
      expect(editedDoc?._rev).toBe(transactionId)
      // Outgoing actions for edit should include a patch payload.
      expect(result.outgoingActions[0].actionType).toBe('sanity.action.document.edit')
      expect(result.outgoingActions[0]).toHaveProperty('patch')
    })

    it('should edit a document when a draft already exists', () => {
      const draft = createDoc('drafts.doc1', 'Draft Title', '1')
      const base: DocumentSet = {'drafts.doc1': draft}
      const working: DocumentSet = {'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.edit',
          patches: [{set: {title: 'New Draft Title'}}],
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      const editedDoc = result.working['drafts.doc1']
      expect(editedDoc).toBeDefined()
      expect(editedDoc?.['title']).toBe('New Draft Title')
      expect(result.outgoingActions[0].actionType).toBe('sanity.action.document.edit')
    })

    it('should edit a document when base and working diverge', () => {
      const publishedBase = createDoc('doc1', 'Original Boring Title')
      const publishedWorking = createDoc('doc1', 'Local Boring Title')
      const base: DocumentSet = {doc1: publishedBase}
      const working: DocumentSet = {doc1: publishedWorking}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.edit',
          patches: [{set: {title: 'Original Cool Title'}}],
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      const draftId = 'drafts.doc1'
      const editedDoc = result.working[draftId]
      expect(editedDoc).toBeDefined()
      expect(editedDoc?._id).toBe(draftId)
      // Despite the working document originally having a different title,
      // the action patch (computed from base) updates the title to 'Edited Title'
      expect(editedDoc?.['title']).toBe('Local Cool Title')
    })

    it('should throw an error when editing a non-existent document', () => {
      const base: DocumentSet = {}
      const working: DocumentSet = {}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.edit',
          patches: [{set: {title: 'Should Fail'}}],
        },
      ]
      expect(() => processActions({actions, transactionId, base, working, timestamp})).toThrow(
        ActionError,
      )
    })
  })

  describe('document.publish', () => {
    it('should publish a draft document', () => {
      const draft = createDoc('drafts.doc1', 'Draft Title', '1')
      const base: DocumentSet = {'drafts.doc1': draft}
      const working: DocumentSet = {'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.publish',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      // After publishing, the draft should be deleted and a published document created.
      expect(result.working['drafts.doc1']).toBeNull()
      const published = result.working['doc1']
      expect(published).toBeDefined()
      expect(published?._id).toBe('doc1')
      expect(published?.['title']).toBe('Draft Title')
      expect(result.outgoingActions).toEqual([
        {
          actionType: 'sanity.action.document.publish',
          draftId: 'drafts.doc1',
          publishedId: 'doc1',
        },
      ])
    })

    it('should throw an error when no draft exists to publish', () => {
      const published = createDoc('doc1', 'Published Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.publish',
        },
      ]
      expect(() => processActions({actions, transactionId, base, working, timestamp})).toThrow(
        ActionError,
      )
    })

    it('should throw when base and working drafts differ', () => {
      // Simulate divergence where the base and working drafts differ.
      const baseDraft = createDoc('drafts.doc1', 'Base Draft', '1')
      const workingDraft = createDoc('drafts.doc1', 'Working Draft', '2')
      const base: DocumentSet = {'drafts.doc1': baseDraft}
      const working: DocumentSet = {'drafts.doc1': workingDraft}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.publish',
        },
      ]
      expect(() =>
        processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
        }),
      ).toThrow(
        /Publish aborted: detected remote changes since published was scheduled. Please try again./,
      )
    })
  })

  describe('document.unpublish', () => {
    it('should unpublish a published document', () => {
      const published = createDoc('doc1', 'Published Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.unpublish',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      // After unpublishing, the published document should be removed and a draft created.
      expect(result.working['doc1']).toBeNull()
      const draft = result.working['drafts.doc1']
      expect(draft).toBeDefined()
      expect(draft?._id).toBe('drafts.doc1')
      expect(draft?.['title']).toBe('Published Title')
      expect(result.outgoingActions).toEqual([
        {
          actionType: 'sanity.action.document.unpublish',
          draftId: 'drafts.doc1',
          publishedId: 'doc1',
        },
      ])
    })

    it('should throw an error when no published document exists for unpublishing', () => {
      const base: DocumentSet = {}
      const working: DocumentSet = {}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.unpublish',
        },
      ]
      expect(() => processActions({actions, transactionId, base, working, timestamp})).toThrow(
        ActionError,
      )
    })

    it('should unpublish using the working published document when base and working differ', () => {
      // Simulate divergence where the published document in base and working differ.
      const basePublished = createDoc('doc1', 'Base Published', '1')
      const workingPublished = createDoc('doc1', 'Working Published', '2')
      const base: DocumentSet = {doc1: basePublished}
      const working: DocumentSet = {doc1: workingPublished}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.unpublish',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })

      // Expect the published document is removed and a draft is created from the working published doc.
      expect(result.working['doc1']).toBeNull()
      const draft = result.working['drafts.doc1']
      expect(draft).toBeDefined()
      expect(draft?._id).toBe('drafts.doc1')
      expect(draft?.['title']).toBe('Working Published')
      expect(result.outgoingActions).toEqual([
        {
          actionType: 'sanity.action.document.unpublish',
          draftId: 'drafts.doc1',
          publishedId: 'doc1',
        },
      ])
    })
  })

  describe('Multiple actions and previousRevs', () => {
    it('should handle multiple actions sequentially and compute previousRevs correctly', () => {
      const published = createDoc('doc1', 'Original Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {documentId: 'doc1', type: 'document.create', documentType: 'article'},
        {documentId: 'doc1', type: 'document.edit', patches: [{set: {title: 'Edited Title'}}]},
        {documentId: 'doc1', type: 'document.publish'},
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
      })
      expect(result.previousRevs).toEqual({doc1: 'initial'})
      const publishedDoc = result.working['doc1']
      expect(publishedDoc).toBeDefined()
      expect(publishedDoc?.['title']).toBe('Edited Title')
    })
  })

  describe('Unexpected action input', () => {
    it('should throw if there is an unrecognized action', () => {
      const published = createDoc('doc1', 'Original Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          // @ts-expect-error testing invalid input
          type: 'document.unrecognizedAction',
        },
      ]

      expect(() => processActions({actions, transactionId, base, working, timestamp})).toThrow(
        /Unknown action type: document.unrecognizedAction/,
      )
    })
  })
})
