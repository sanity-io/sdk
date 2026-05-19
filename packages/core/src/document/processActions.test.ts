import {type CreateMutation, type Reference, type SanityDocument} from '@sanity/types'
import {parse} from 'groq-js'
import {describe, expect, it} from 'vitest'

import {type Action, type DocumentAction} from './actions'
import {ActionError, processActions} from './processActions/processActions'
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

// Define dummy grants using GROQ expressions
const alwaysAllow = parse('true')
const alwaysDeny = parse('false')
const defaultGrants = {
  create: alwaysAllow,
  update: alwaysAllow,
  read: alwaysAllow,
  history: alwaysAllow,
}

const transactionId = 'txn-123'
const timestamp = '2025-02-02T00:00:00.000Z'

// Helper: Create a sample liveEdit document
const createLiveEditDoc = (id: string, title: string, rev: string = 'initial'): SanityDocument => ({
  _id: id,
  _type: 'liveArticle',
  _createdAt: '2025-01-01T00:00:00.000Z',
  _updatedAt: '2025-01-01T00:00:00.000Z',
  _rev: rev,
  title,
})

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
        grants: defaultGrants,
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
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
      ).toThrow(ActionError)
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
        grants: defaultGrants,
      })

      const draftId = 'drafts.doc1'
      const draftDoc = result.working[draftId]
      expect(draftDoc).toBeDefined()
      expect(draftDoc?._id).toBe(draftId)
      // Expect that the draft is built from the working version:
      expect(draftDoc?.['title']).toBe('Working Title')
    })

    it('should throw PermissionActionError if create permission is denied', () => {
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
      const grants = {...defaultGrants, create: alwaysDeny}
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(/You do not have permission to create a draft for document "doc1"/)
    })

    it('should create a draft document with initial values', () => {
      const base: DocumentSet = {}
      const working: DocumentSet = {}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.create',
          documentType: 'article',
          initialValue: {
            title: 'New Article',
            author: 'John Doe',
            count: 42,
          },
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
      })

      const draftId = 'drafts.doc1'
      const draftDoc = result.working[draftId]
      expect(draftDoc).toBeDefined()
      expect(draftDoc?._id).toBe(draftId)
      expect(draftDoc?._type).toBe('article')
      expect(draftDoc?._rev).toBe(transactionId)
      // Should have the initial values:
      expect(draftDoc?.['title']).toBe('New Article')
      expect(draftDoc?.['author']).toBe('John Doe')
      expect(draftDoc?.['count']).toBe(42)
    })

    it('should create a draft with initial values that override published document values', () => {
      const published = createDoc('doc1', 'Original Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.create',
          documentType: 'article',
          initialValue: {
            title: 'Overridden Title',
            newField: 'New Value',
          },
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
      })

      const draftId = 'drafts.doc1'
      const draftDoc = result.working[draftId]
      expect(draftDoc).toBeDefined()
      // Should have the overridden title from initialValue:
      expect(draftDoc?.['title']).toBe('Overridden Title')
      // Should have the new field:
      expect(draftDoc?.['newField']).toBe('New Value')
    })

    it('should create a draft with empty initial values object', () => {
      const base: DocumentSet = {}
      const working: DocumentSet = {}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          type: 'document.create',
          documentType: 'article',
          initialValue: {},
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
      })

      const draftId = 'drafts.doc1'
      const draftDoc = result.working[draftId]
      expect(draftDoc).toBeDefined()
      expect(draftDoc?._id).toBe(draftId)
      expect(draftDoc?._type).toBe('article')
      expect(draftDoc?._rev).toBe(transactionId)
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
          documentType: 'article',
          type: 'document.delete',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
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
          documentType: 'article',
          type: 'document.delete',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
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

    it('should throw PermissionActionError if update permission is denied for deletion', () => {
      const published = createDoc('doc1', 'Published Title')
      const draft = createDoc('drafts.doc1', 'Draft Title')
      const base: DocumentSet = {'doc1': published, 'drafts.doc1': draft}
      const working: DocumentSet = {'doc1': published, 'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          documentType: 'article',
          type: 'document.delete',
        },
      ]
      const grants = {...defaultGrants, update: alwaysDeny}
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(/You do not have permission to delete this document/)
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
          documentType: 'article',
          type: 'document.discard',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
      })

      expect(result.working['drafts.doc1']).toBeNull()
      expect(result.outgoingActions).toEqual([
        {
          actionType: 'sanity.action.document.version.discard',
          versionId: 'drafts.doc1',
        },
      ])
    })

    it('should throw PermissionActionError if update permission is denied for discard', () => {
      const draft = createDoc('drafts.doc1', 'Draft Title', '1')
      const base: DocumentSet = {'drafts.doc1': draft}
      const working: DocumentSet = {'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          documentType: 'article',
          type: 'document.discard',
        },
      ]
      const grants = {...defaultGrants, update: alwaysDeny}
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(/You do not have permission to discard changes for document "doc1"/)
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
          documentType: 'article',
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
        grants: defaultGrants,
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
          documentType: 'article',
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
        grants: defaultGrants,
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
          documentType: 'article',
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
        grants: defaultGrants,
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
          documentType: 'article',
          type: 'document.edit',
          patches: [{set: {title: 'Should Fail'}}],
        },
      ]
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
      ).toThrow(ActionError)
    })

    it('should throw PermissionActionError if create permission is denied during edit', () => {
      const published = createDoc('doc1', 'Original Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          documentType: 'article',
          type: 'document.edit',
          patches: [{set: {title: 'Edited Title'}}],
        },
      ]
      const grants = {...defaultGrants, create: alwaysDeny}
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(/You do not have permission to create a draft for editing this document/)
    })

    it('should throw PermissionActionError if update permission is denied during edit', () => {
      const draft = createDoc('drafts.doc1', 'Draft Title', '1')
      const base: DocumentSet = {'drafts.doc1': draft}
      const working: DocumentSet = {'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          documentType: 'article',
          type: 'document.edit',
          patches: [{set: {title: 'New Title'}}],
        },
      ]
      const grants = {...defaultGrants, update: alwaysDeny}
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(/You do not have permission to edit document "doc1"/)
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
          documentType: 'article',
          type: 'document.publish',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
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
          documentType: 'article',
          type: 'document.publish',
        },
      ]
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
      ).toThrow(ActionError)
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
          documentType: 'article',
          type: 'document.publish',
        },
      ]
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
      ).toThrow(/Publish aborted: The document has changed elsewhere. Please try again./)
    })

    it('should throw PermissionActionError if update permission is denied for draft during publish', () => {
      const draft = createDoc('drafts.doc1', 'Draft Title', '1')
      const base: DocumentSet = {'drafts.doc1': draft}
      const working: DocumentSet = {'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {documentId: 'doc1', documentType: 'article', type: 'document.publish'},
      ]
      const grants = {...defaultGrants, update: alwaysDeny}
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(/Publish failed: You do not have permission to update the draft for "doc1"/)
    })

    it('should throw PermissionActionError if update permission is denied for published during publish', () => {
      const draft = createDoc('drafts.doc1', 'Draft Title', '1')
      const published = createDoc('doc1', 'Published Title', '1')
      const base: DocumentSet = {'drafts.doc1': draft, 'doc1': published}
      const working: DocumentSet = {'drafts.doc1': draft, 'doc1': published}
      const actions: DocumentAction[] = [
        {documentId: 'doc1', documentType: 'article', type: 'document.publish'},
      ]
      const grants = {
        ...defaultGrants,
        update: parse(`$document {"_": _id in path("drafts.**")}._`),
      }
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(
        /Publish failed: You do not have permission to update the published version of "doc1"/,
      )
    })

    it('should throw PermissionActionError if create permission is denied when publishing a new version', () => {
      const draft = createDoc('drafts.doc1', 'Draft Title', '1')
      // simulate case where there is no published version
      const base: DocumentSet = {'drafts.doc1': draft}
      const working: DocumentSet = {'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {documentId: 'doc1', documentType: 'article', type: 'document.publish'},
      ]
      const grants = {...defaultGrants, create: alwaysDeny}
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(/Publish failed: You do not have permission to publish a new version of "doc1"/)
    })

    it('should strengthen `_strengthenOnPublish` references', () => {
      const _ref = crypto.randomUUID()
      const referenceToStrength: Reference = {
        _ref,
        _type: 'reference',
        _weak: true,
        _strengthenOnPublish: {
          type: 'author',
        },
      }
      const strengthenedReference: Reference = {
        _ref,
        _type: 'reference',
      }

      const draft = {
        ...createDoc('drafts.doc1', 'Draft Title', '1'),
        referenceToStrength,
        nestedObject: {referenceToStrength},
        items: [referenceToStrength],
      }
      const base: DocumentSet = {'drafts.doc1': draft}
      const working: DocumentSet = {'drafts.doc1': draft}
      const actions: DocumentAction[] = [
        {
          documentId: 'doc1',
          documentType: 'article',
          type: 'document.publish',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
      })

      // After publishing, the draft should be deleted and a published document created.
      expect(result.working['drafts.doc1']).toBeNull()
      const published = result.working['doc1'] as typeof draft
      expect(published).toBeDefined()
      expect(published?._id).toBe('doc1')
      expect(published.referenceToStrength).toEqual(strengthenedReference)
      expect(published.nestedObject.referenceToStrength).toEqual(strengthenedReference)
      expect(published.items.at(0)).toEqual(strengthenedReference)
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
          documentType: 'article',
          type: 'document.unpublish',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
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
          documentType: 'article',
          type: 'document.unpublish',
        },
      ]
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
      ).toThrow(ActionError)
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
          documentType: 'article',
          type: 'document.unpublish',
        },
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
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

    it('should throw PermissionActionError if update permission is denied during unpublish', () => {
      const published = createDoc('doc1', 'Published Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {documentId: 'doc1', documentType: 'article', type: 'document.unpublish'},
      ]
      const grants = {...defaultGrants, update: alwaysDeny}
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(/You do not have permission to unpublish the document "doc1"/)
    })

    it('should throw PermissionActionError if create permission is denied when unpublishing', () => {
      const published = createDoc('doc1', 'Published Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {documentId: 'doc1', documentType: 'article', type: 'document.unpublish'},
      ]
      const grants = {...defaultGrants, create: alwaysDeny}
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants}),
      ).toThrow(/You do not have permission to create a draft from the published version of "doc1"/)
    })
  })

  describe('Multiple actions and previousRevs', () => {
    it('should handle multiple actions sequentially and compute previousRevs correctly', () => {
      const published = createDoc('doc1', 'Original Title')
      const base: DocumentSet = {doc1: published}
      const working: DocumentSet = {doc1: published}
      const actions: DocumentAction[] = [
        {documentId: 'doc1', documentType: 'article', type: 'document.create'},
        {
          documentId: 'doc1',
          documentType: 'article',
          type: 'document.edit',
          patches: [{set: {title: 'Edited Title'}}],
        },
        {documentId: 'doc1', documentType: 'article', type: 'document.publish'},
      ]
      const result = processActions({
        actions,
        transactionId,
        base,
        working,
        timestamp,
        grants: defaultGrants,
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
      expect(() =>
        processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
      ).toThrow(/Unknown action type: "document.unrecognizedAction"/)
    })
  })

  describe('liveEdit documents', () => {
    describe('document.create', () => {
      it('should create a liveEdit document directly without draft logic', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.create',
            documentType: 'liveArticle',
            liveEdit: true,
          },
        ]

        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        const doc = result.working['live1']
        expect(doc).toBeDefined()
        expect(doc?._id).toBe('live1')
        expect(doc?._type).toBe('liveArticle')
        expect(doc?._rev).toBe(transactionId)

        // Should not use actions
        expect(result.outgoingActions).toHaveLength(0)
        expect(result.outgoingMutations).toHaveLength(1)
        const mutation = result.outgoingMutations[0] as CreateMutation
        expect(mutation.create._id).toBe('live1')
        expect(mutation.create._type).toBe('liveArticle')
      })

      it('should apply initialValue when creating a liveEdit document', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.create',
            documentType: 'liveArticle',
            liveEdit: true,
            initialValue: {title: 'Initial Title', count: 42},
          },
        ]

        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        const doc = result.working['live1']
        expect(doc?.['title']).toBe('Initial Title')
        expect(doc?.['count']).toBe(42)

        const mutation = result.outgoingMutations[0] as CreateMutation
        expect(mutation.create['title']).toBe('Initial Title')
        expect(mutation.create['count']).toBe(42)
      })

      it('should throw an error if liveEdit document already exists', () => {
        const existingDoc = createLiveEditDoc('live1', 'Existing')
        const base: DocumentSet = {live1: existingDoc}
        const working: DocumentSet = {live1: existingDoc}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.create',
            documentType: 'liveArticle',
            liveEdit: true,
          },
        ]

        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow('This document already exists')
      })
    })

    describe('document.edit', () => {
      it('should edit a liveEdit document directly', () => {
        const doc = createLiveEditDoc('live1', 'Original Title')
        const base: DocumentSet = {live1: doc}
        const working: DocumentSet = {live1: doc}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.edit',
            documentType: 'liveArticle',
            liveEdit: true,
            patches: [{set: {title: 'Updated Title'}}],
          },
        ]

        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        const editedDoc = result.working['live1']
        expect(editedDoc).toBeDefined()
        expect(editedDoc?.['title']).toBe('Updated Title')
        expect(editedDoc?._id).toBe('live1')

        expect(result.outgoingMutations[0]).toEqual({
          patch: {
            id: 'live1',
            diffMatchPatch: {
              title: '@@ -1,12 +1,11 @@\n-Original\n+Updated\n  Tit\n',
            },
          },
        })
        expect(result.outgoingActions).toHaveLength(0)
      })

      it('should throw an error if liveEdit document does not exist', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.edit',
            documentType: 'liveArticle',
            liveEdit: true,
            patches: [{set: {title: 'New Title'}}],
          },
        ]

        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow('Cannot edit document because it does not exist')
      })
    })

    describe('document.delete', () => {
      it('should delete a liveEdit document directly', () => {
        const doc = createLiveEditDoc('live1', 'To Delete')
        const base: DocumentSet = {live1: doc}
        const working: DocumentSet = {live1: doc}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.delete',
            documentType: 'liveArticle',
            liveEdit: true,
          },
        ]

        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        expect(result.working['live1']).toBeNull()

        expect(result.outgoingActions).toHaveLength(0)
        expect(result.outgoingMutations).toHaveLength(1)
        expect(result.outgoingMutations[0]).toEqual({delete: {id: 'live1'}})
      })

      it('should throw an error if liveEdit document does not exist', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.delete',
            documentType: 'liveArticle',
            liveEdit: true,
          },
        ]

        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow('The document you are trying to delete does not exist')
      })
    })

    describe('document.publish', () => {
      it('should throw an error for liveEdit documents', () => {
        const doc = createLiveEditDoc('live1', 'Title')
        const base: DocumentSet = {live1: doc}
        const working: DocumentSet = {live1: doc}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.publish',
            documentType: 'liveArticle',
            liveEdit: true,
          },
        ]

        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow(/Publishing is not supported for liveEdit or version/)
      })
    })

    describe('document.unpublish', () => {
      it('should throw an error for liveEdit documents', () => {
        const doc = createLiveEditDoc('live1', 'Title')
        const base: DocumentSet = {live1: doc}
        const working: DocumentSet = {live1: doc}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.unpublish',
            documentType: 'liveArticle',
            liveEdit: true,
          },
        ]

        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow(/Unpublishing is not supported for liveEdit or version/)
      })
    })

    describe('document.discard', () => {
      it('should throw an error for liveEdit documents', () => {
        const doc = createLiveEditDoc('live1', 'Title')
        const base: DocumentSet = {live1: doc}
        const working: DocumentSet = {live1: doc}
        const actions: DocumentAction[] = [
          {
            documentId: 'live1',
            type: 'document.discard',
            documentType: 'liveArticle',
            liveEdit: true,
          },
        ]

        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow('Cannot discard changes for liveEdit document "live1"')

        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow('LiveEdit documents do not support drafts')
      })
    })
  })

  describe('release perspective (version) documents', () => {
    const releaseName = 'test-release'
    const perspective = {releaseName}
    const versionId = `versions.${releaseName}.doc1`

    describe('document.create', () => {
      it('should create a version document for a release perspective', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.create',
            documentType: 'article',
            perspective,
          },
        ]
        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        const versionDoc = result.working[versionId]
        expect(versionDoc).toBeDefined()
        expect(versionDoc?._id).toBe(versionId)
        expect(versionDoc?._type).toBe('article')
        expect(versionDoc?._rev).toBe(transactionId)

        expect(result.outgoingActions).toEqual([
          {
            actionType: 'sanity.action.document.version.create',
            publishedId: 'doc1',
            attributes: expect.objectContaining({_id: versionId, _type: 'article'}),
          },
        ])
      })

      it('should create a version document using the published document as a base', () => {
        const published = createDoc('doc1', 'Published Title')
        const base: DocumentSet = {doc1: published}
        const working: DocumentSet = {doc1: published}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.create',
            documentType: 'article',
            perspective,
          },
        ]
        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        const versionDoc = result.working[versionId]
        expect(versionDoc).toBeDefined()
        expect(versionDoc?._id).toBe(versionId)
        expect(versionDoc?.['title']).toBe('Published Title')
      })

      it('should throw if a version document already exists', () => {
        const existingVersion = createDoc(versionId, 'Existing Version')
        const base: DocumentSet = {[versionId]: existingVersion}
        const working: DocumentSet = {[versionId]: existingVersion}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.create',
            documentType: 'article',
            perspective,
          },
        ]
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow(/release version.*already exists/i)
      })

      it('should create a version document with initial values', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.create',
            documentType: 'article',
            perspective,
            initialValue: {title: 'Release Version Title', count: 7},
          },
        ]
        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        const versionDoc = result.working[versionId]
        expect(versionDoc?.['title']).toBe('Release Version Title')
        expect(versionDoc?.['count']).toBe(7)
      })

      it('should throw PermissionActionError if create permission is denied', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.create',
            documentType: 'article',
            perspective,
          },
        ]
        const grants = {...defaultGrants, create: alwaysDeny}
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants}),
        ).toThrow(/You do not have permission to create a release version/)
      })
    })

    describe('document.edit', () => {
      it('should edit a version document directly', () => {
        const version = createDoc(versionId, 'Original Version Title')
        const base: DocumentSet = {[versionId]: version}
        const working: DocumentSet = {[versionId]: version}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.edit',
            documentType: 'article',
            perspective,
            patches: [{set: {title: 'Updated Version Title'}}],
          },
        ]
        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        const editedDoc = result.working[versionId]
        expect(editedDoc?.['title']).toBe('Updated Version Title')
        expect(editedDoc?._id).toBe(versionId)

        // outgoing action should use versionId as draftId and the base publishedId
        expect(result.outgoingActions[0]).toMatchObject({
          actionType: 'sanity.action.document.edit',
          draftId: versionId,
          publishedId: 'doc1',
        })
      })

      it('should throw if the version document does not exist', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.edit',
            documentType: 'article',
            perspective,
            patches: [{set: {title: 'Should Fail'}}],
          },
        ]
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow(/does not exist in the release/)
      })

      it('should throw PermissionActionError if update permission is denied', () => {
        const version = createDoc(versionId, 'Version Title')
        const base: DocumentSet = {[versionId]: version}
        const working: DocumentSet = {[versionId]: version}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.edit',
            documentType: 'article',
            perspective,
            patches: [{set: {title: 'No Permission'}}],
          },
        ]
        const grants = {...defaultGrants, update: alwaysDeny}
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants}),
        ).toThrow(/You do not have permission to edit document/)
      })
    })

    describe('document.discard', () => {
      it('should discard a version document', () => {
        const version = createDoc(versionId, 'Version Title')
        const base: DocumentSet = {[versionId]: version}
        const working: DocumentSet = {[versionId]: version}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.discard',
            documentType: 'article',
            perspective,
          },
        ]
        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        expect(result.working[versionId]).toBeNull()
        expect(result.outgoingActions).toEqual([
          {
            actionType: 'sanity.action.document.version.discard',
            versionId,
          },
        ])
      })

      it('should throw if there is no version document to discard', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.discard',
            documentType: 'article',
            perspective,
          },
        ]
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow(/no draft or version available to discard/)
      })

      it('should throw PermissionActionError if update permission is denied', () => {
        const version = createDoc(versionId, 'Version Title')
        const base: DocumentSet = {[versionId]: version}
        const working: DocumentSet = {[versionId]: version}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.discard',
            documentType: 'article',
            perspective,
          },
        ]
        const grants = {...defaultGrants, update: alwaysDeny}
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants}),
        ).toThrow(/You do not have permission to discard changes/)
      })
    })

    describe('document.publish', () => {
      it('should throw for release perspective documents', () => {
        const version = createDoc(versionId, 'Version Title')
        const base: DocumentSet = {[versionId]: version}
        const working: DocumentSet = {[versionId]: version}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.publish',
            documentType: 'article',
            perspective,
          },
        ]
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow(/Publishing is not supported for liveEdit or version/)
      })
    })

    describe('document.delete', () => {
      it('should throw for release perspective documents', () => {
        const version = createDoc(versionId, 'Version Title')
        const base: DocumentSet = {[versionId]: version}
        const working: DocumentSet = {[versionId]: version}
        const actions: DocumentAction[] = [
          {
            documentId: versionId,
            type: 'document.delete',
            documentType: 'article',
            perspective,
          },
        ]
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow(/Cannot delete a version document/)
      })
    })
  })

  describe('release actions', () => {
    const releaseName = 'my-release'
    const releaseDocId = `_.releases.${releaseName}`

    const createReleaseDoc = (overrides: Partial<SanityDocument> = {}): SanityDocument => ({
      _id: releaseDocId,
      _type: 'system.release',
      _createdAt: '2025-01-01T00:00:00.000Z',
      _updatedAt: '2025-01-01T00:00:00.000Z',
      _rev: 'initial',
      name: releaseName,
      state: 'active',
      metadata: {releaseType: 'undecided'},
      ...overrides,
    })

    describe('release.create', () => {
      it('inserts an optimistic release doc and emits a release.create action', () => {
        const base: DocumentSet = {}
        const working: DocumentSet = {}
        const actions: Action[] = [
          {
            type: 'release.create',
            releaseId: releaseName,
            metadata: {title: 'My release', releaseType: 'asap'},
          },
        ]

        const result = processActions({
          actions,
          transactionId,
          base,
          working,
          timestamp,
          grants: defaultGrants,
        })

        const doc = result.working[releaseDocId]
        expect(doc).toBeDefined()
        expect(doc?._type).toBe('system.release')
        expect(doc?.['name']).toBe(releaseName)
        expect(doc?.['state']).toBe('active')
        expect(doc?.['metadata']).toEqual({title: 'My release', releaseType: 'asap'})

        expect(result.outgoingActions).toEqual([
          {
            actionType: 'sanity.action.release.create',
            releaseId: releaseName,
            metadata: {title: 'My release', releaseType: 'asap'},
          },
        ])
      })

      it('throws if the release already exists in base or working', () => {
        const existing = createReleaseDoc()
        expect(() =>
          processActions({
            actions: [
              {
                type: 'release.create',
                releaseId: releaseName,
                metadata: {releaseType: 'undecided'},
              },
            ],
            transactionId,
            base: {[releaseDocId]: existing},
            working: {[releaseDocId]: existing},
            timestamp,
            grants: defaultGrants,
          }),
        ).toThrow(/already exists/)
      })

      it('throws PermissionActionError when the create grant is denied', () => {
        expect(() =>
          processActions({
            actions: [
              {
                type: 'release.create',
                releaseId: releaseName,
                metadata: {releaseType: 'undecided'},
              },
            ],
            transactionId,
            base: {},
            working: {},
            timestamp,
            grants: {...defaultGrants, create: alwaysDeny},
          }),
        ).toThrow(/permission to create release/)
      })
    })

    describe('release.edit', () => {
      it('applies the patch optimistically and forwards the original patch to the outgoing action', () => {
        const existing = createReleaseDoc({
          metadata: {releaseType: 'undecided'},
        } as Partial<SanityDocument>)
        const patch = {set: {'metadata.title': 'Updated title'}}

        const result = processActions({
          actions: [{type: 'release.edit', releaseId: releaseName, patch}],
          transactionId,
          base: {[releaseDocId]: existing},
          working: {[releaseDocId]: existing},
          timestamp,
          grants: defaultGrants,
        })

        const updated = result.working[releaseDocId] as SanityDocument & {
          metadata: {title?: string; releaseType: string}
        }
        expect(updated.metadata.title).toBe('Updated title')
        // releaseType wasn't unset
        expect(updated.metadata.releaseType).toBe('undecided')

        expect(result.outgoingActions).toEqual([
          {
            actionType: 'sanity.action.release.edit',
            releaseId: releaseName,
            patch,
          },
        ])
      })

      it('throws when editing a release that does not exist', () => {
        expect(() =>
          processActions({
            actions: [
              {
                type: 'release.edit',
                releaseId: releaseName,
                patch: {set: {'metadata.title': 'x'}},
              },
            ],
            transactionId,
            base: {},
            working: {},
            timestamp,
            grants: defaultGrants,
          }),
        ).toThrow(/does not exist/)
      })

      it('throws PermissionActionError when the working release fails the update grant', () => {
        const existing = createReleaseDoc()
        expect(() =>
          processActions({
            actions: [
              {
                type: 'release.edit',
                releaseId: releaseName,
                patch: {set: {'metadata.title': 'x'}},
              },
            ],
            transactionId,
            base: {[releaseDocId]: existing},
            working: {[releaseDocId]: existing},
            timestamp,
            grants: {...defaultGrants, update: alwaysDeny},
          }),
        ).toThrow(/permission to edit release/)
      })
    })

    describe('fire-and-forget actions', () => {
      const existing = createReleaseDoc()
      const cases: Array<{
        name: string
        action: Action
        expectedOutgoing: Record<string, unknown>
      }> = [
        {
          name: 'release.publish',
          action: {type: 'release.publish', releaseId: releaseName},
          expectedOutgoing: {actionType: 'sanity.action.release.publish', releaseId: releaseName},
        },
        {
          name: 'release.schedule',
          action: {
            type: 'release.schedule',
            releaseId: releaseName,
            publishAt: '2026-01-01T00:00:00.000Z',
          },
          expectedOutgoing: {
            actionType: 'sanity.action.release.schedule',
            releaseId: releaseName,
            publishAt: '2026-01-01T00:00:00.000Z',
          },
        },
        {
          name: 'release.unschedule',
          action: {type: 'release.unschedule', releaseId: releaseName},
          expectedOutgoing: {
            actionType: 'sanity.action.release.unschedule',
            releaseId: releaseName,
          },
        },
        {
          name: 'release.archive',
          action: {type: 'release.archive', releaseId: releaseName},
          expectedOutgoing: {actionType: 'sanity.action.release.archive', releaseId: releaseName},
        },
        {
          name: 'release.unarchive',
          action: {type: 'release.unarchive', releaseId: releaseName},
          expectedOutgoing: {actionType: 'sanity.action.release.unarchive', releaseId: releaseName},
        },
      ]

      it.each(cases)(
        '$name does not mutate local state and emits the matching outgoing action',
        ({action, expectedOutgoing}) => {
          const base: DocumentSet = {[releaseDocId]: existing}
          const working: DocumentSet = {[releaseDocId]: existing}

          const result = processActions({
            actions: [action],
            transactionId,
            base,
            working,
            timestamp,
            grants: defaultGrants,
          })

          // working and base reference the same doc instance — no optimistic
          // mutation was applied
          expect(result.working[releaseDocId]).toBe(existing)
          expect(result.outgoingActions).toEqual([expectedOutgoing])
          expect(result.outgoingMutations).toEqual([])
        },
      )

      it.each(cases)('$name throws if the release does not exist', ({action}) => {
        expect(() =>
          processActions({
            actions: [action],
            transactionId,
            base: {},
            working: {},
            timestamp,
            grants: defaultGrants,
          }),
        ).toThrow(ActionError)
      })

      it.each(cases)(
        '$name throws PermissionActionError when update grant is denied',
        ({action}) => {
          const base: DocumentSet = {[releaseDocId]: existing}
          const working: DocumentSet = {[releaseDocId]: existing}
          expect(() =>
            processActions({
              actions: [action],
              transactionId,
              base,
              working,
              timestamp,
              grants: {...defaultGrants, update: alwaysDeny},
            }),
          ).toThrow(/permission to/)
        },
      )
    })

    describe('release.schedule publishAt validation', () => {
      const existing = createReleaseDoc()

      it.each(['not-a-date', '', '2026-13-40T99:99:99Z'])(
        'throws ActionError when publishAt is not a valid timestamp (%s)',
        (publishAt) => {
          expect(() =>
            processActions({
              actions: [{type: 'release.schedule', releaseId: releaseName, publishAt}],
              transactionId,
              base: {[releaseDocId]: existing},
              working: {[releaseDocId]: existing},
              timestamp,
              grants: defaultGrants,
            }),
          ).toThrow(/must be a valid ISO 8601 timestamp/)
        },
      )
    })

    describe('release.delete', () => {
      it.each(['archived', 'published'] as const)(
        'optimistically removes the local release when state is %s',
        (state) => {
          const existing = createReleaseDoc({state} as Partial<SanityDocument>)
          const result = processActions({
            actions: [{type: 'release.delete', releaseId: releaseName}],
            transactionId,
            base: {[releaseDocId]: existing},
            working: {[releaseDocId]: existing},
            timestamp,
            grants: defaultGrants,
          })

          // processMutations sets deleted entries to null
          expect(result.working[releaseDocId]).toBeNull()
          expect(result.outgoingMutations).toEqual([{delete: {id: releaseDocId}}])
          expect(result.outgoingActions).toEqual([
            {actionType: 'sanity.action.release.delete', releaseId: releaseName},
          ])
        },
      )

      it.each(['active', 'scheduled', 'archiving', 'publishing'] as const)(
        'throws when state is %s (server only accepts archived/published)',
        (state) => {
          const existing = createReleaseDoc({state} as Partial<SanityDocument>)
          expect(() =>
            processActions({
              actions: [{type: 'release.delete', releaseId: releaseName}],
              transactionId,
              base: {[releaseDocId]: existing},
              working: {[releaseDocId]: existing},
              timestamp,
              grants: defaultGrants,
            }),
          ).toThrow(/Archive it first/)
        },
      )

      it('throws if the release does not exist', () => {
        expect(() =>
          processActions({
            actions: [{type: 'release.delete', releaseId: releaseName}],
            transactionId,
            base: {},
            working: {},
            timestamp,
            grants: defaultGrants,
          }),
        ).toThrow(/does not exist/)
      })

      it('throws PermissionActionError when the update grant is denied', () => {
        const existing = createReleaseDoc({state: 'archived'} as Partial<SanityDocument>)
        expect(() =>
          processActions({
            actions: [{type: 'release.delete', releaseId: releaseName}],
            transactionId,
            base: {[releaseDocId]: existing},
            working: {[releaseDocId]: existing},
            timestamp,
            grants: {...defaultGrants, update: alwaysDeny},
          }),
        ).toThrow(/permission to delete release/)
      })
    })

    describe('mixed with liveEdit document actions', () => {
      const liveEditDocId = 'live-edit-doc'
      const liveEditDoc = {
        _id: liveEditDocId,
        _type: 'liveEditType',
        _createdAt: '2025-01-01T00:00:00.000Z',
        _updatedAt: '2025-01-01T00:00:00.000Z',
        _rev: 'initial',
      }
      const liveEditAction = {
        type: 'document.edit',
        documentId: liveEditDocId,
        documentType: 'liveEditType',
        liveEdit: true,
        patches: [{set: {title: 'x'}}],
      } as const

      it('throws ActionError when a transaction mixes a release action with a liveEdit document action', () => {
        expect(() =>
          processActions({
            actions: [
              {
                type: 'release.create',
                releaseId: releaseName,
                metadata: {releaseType: 'undecided'},
              },
              liveEditAction as unknown as Action,
            ],
            transactionId,
            base: {[liveEditDocId]: liveEditDoc},
            working: {[liveEditDocId]: liveEditDoc},
            timestamp,
            grants: defaultGrants,
          }),
        ).toThrow(/Cannot combine liveEdit document actions with other actions/)
      })

      it('throws ActionError when a transaction mixes a non-liveEdit document action with a liveEdit document action', () => {
        const otherDocId = 'other-doc'
        const otherDoc = {
          _id: otherDocId,
          _type: 'someType',
          _createdAt: '2025-01-01T00:00:00.000Z',
          _updatedAt: '2025-01-01T00:00:00.000Z',
          _rev: 'initial',
        } as SanityDocument

        expect(() =>
          processActions({
            actions: [
              {
                type: 'document.edit',
                documentId: otherDocId,
                documentType: 'someType',
                patches: [{set: {title: 'y'}}],
              },
              liveEditAction as unknown as Action,
            ],
            transactionId,
            base: {[liveEditDocId]: liveEditDoc, [otherDocId]: otherDoc},
            working: {[liveEditDocId]: liveEditDoc, [otherDocId]: otherDoc},
            timestamp,
            grants: defaultGrants,
          }),
        ).toThrow(/Cannot combine liveEdit document actions with other actions/)
      })
    })
  })
})
