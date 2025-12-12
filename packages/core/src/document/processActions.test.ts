import {type Reference, type SanityDocument} from '@sanity/types'
import {parse} from 'groq-js'
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

        // Should use document.create action, not version.create
        expect(result.outgoingActions).toHaveLength(1)
        const action = result.outgoingActions[0]
        expect(action.actionType).toBe('sanity.action.document.create')
        if ('attributes' in action && 'publishedId' in action) {
          expect(action.publishedId).toBe('live1')
          expect(action.attributes._id).toBe('live1')
          expect(action.attributes._type).toBe('liveArticle')
        } else {
          throw new Error('Expected action to have attributes and publishedId')
        }
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

        // Should use document.edit action with draftId prefixed (for server validation) but publishedId as the actual doc
        expect(result.outgoingActions[0]).toMatchObject({
          actionType: 'sanity.action.document.edit',
          draftId: 'drafts.live1',
          publishedId: 'live1',
        })
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

        expect(result.outgoingActions).toEqual([
          {
            actionType: 'sanity.action.document.delete',
            publishedId: 'live1',
          },
        ])
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
        ).toThrow('Cannot publish liveEdit document')
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow('LiveEdit documents do not support drafts or publishing')
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
        ).toThrow('Cannot unpublish liveEdit document')
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow('LiveEdit documents do not support drafts or publishing')
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
        ).toThrow('Cannot discard changes for liveEdit document')
        expect(() =>
          processActions({actions, transactionId, base, working, timestamp, grants: defaultGrants}),
        ).toThrow('LiveEdit documents do not support drafts')
      })
    })
  })
})
