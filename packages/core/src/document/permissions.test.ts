import {type SanityDocument} from '@sanity/types'
import {type ExprNode} from 'groq-js'
import {describe, expect, it} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {getDraftId, getPublishedId} from '../utils/ids'
import {evaluateSync, parse} from './_synchronous-groq-js.mjs'
import {type DocumentAction} from './actions'
import {calculatePermissions, createGrantsLookup, type DatasetAcl, type Grant} from './permissions'
import {type SyncTransactionState} from './reducers'

const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

afterAll(() => {
  instance.dispose()
})

// Helper: Create a sample document that conforms to SanityDocument.
const createDoc = (id: string, title: string, rev: string = 'initial'): SanityDocument => ({
  _id: id,
  _type: 'article',
  _createdAt: '2025-01-01T00:00:00.000Z',
  _updatedAt: '2025-01-01T00:00:00.000Z',
  _rev: rev,
  title,
})

// Simple "always allow" and "always deny" expressions
const alwaysAllow = parse('true')
const alwaysDeny = parse('false')

// Helper to create a state object
const createState = (
  docStates: Record<string, {local: unknown}>,
  grants?: Record<Grant, ExprNode>,
): SyncTransactionState => ({
  documentStates: docStates as SyncTransactionState['documentStates'],
  grants,
  queued: [],
  applied: [],
})

describe('createGrantsLookup', () => {
  it('should create a lookup with expressions that evaluate to true', () => {
    const datasetAcl: DatasetAcl = [
      {filter: '_id != null', permissions: ['read', 'update', 'create', 'history']},
    ]
    const grants = createGrantsLookup(datasetAcl)
    const dummyDoc = {_id: 'doc1'}
    ;(['read', 'update', 'create', 'history'] as Grant[]).forEach((key) => {
      expect(grants[key]).toBeDefined()
      // Evaluate the expression for the dummy document.
      expect(evaluateSync(grants[key], {params: {document: dummyDoc}}).get()).toBe(true)
    })
  })
})

describe('calculatePermissions', () => {
  const defaultGrants = {
    create: alwaysAllow,
    update: alwaysAllow,
    read: alwaysAllow,
    history: alwaysAllow,
  }

  it('should return allowed true when no errors occur', () => {
    // For a document.create action, the selector expects both published and draft keys.
    const state = createState(
      {
        [getPublishedId('doc1')]: {local: createDoc('doc1', 'Original Title')},
        [getDraftId('doc1')]: {local: null},
      },
      defaultGrants,
    )

    const actions: DocumentAction[] = [
      {documentId: 'doc1', type: 'document.create', documentType: 'article'},
    ]
    const result = calculatePermissions({instance, state}, actions)
    expect(result).toEqual({allowed: true})
  })

  it('should return undefined if documents are incomplete', () => {
    // Missing the draft key will cause documentsSelector to return undefined.
    const state = createState(
      {
        [getPublishedId('doc1')]: {local: createDoc('doc1', 'Title')},
        // Missing getDraftId('doc1')
      },
      defaultGrants,
    )
    const actions: DocumentAction[] = [
      {documentId: 'doc1', type: 'document.create', documentType: 'article'},
    ]
    expect(calculatePermissions({instance, state}, actions)).toBeUndefined()
  })

  it('should catch PermissionActionError from processActions and return allowed false with a reason', () => {
    // Deny the create grant so that document.create will fail.
    const deniedGrants = {...defaultGrants, create: alwaysDeny}
    const state = createState(
      {
        [getPublishedId('doc1')]: {local: createDoc('doc1', 'Title')},
        [getDraftId('doc1')]: {local: null},
      },
      deniedGrants,
    )
    const actions: DocumentAction[] = [
      {documentId: 'doc1', type: 'document.create', documentType: 'article'},
    ]
    const result = calculatePermissions({instance, state}, actions)
    expect(result).toBeDefined()
    expect(result?.allowed).toBe(false)
    expect(result?.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'do not have permission to create a draft for document "doc1"',
          ),
          type: 'access',
          documentId: 'doc1',
        }),
      ]),
    )
  })

  it('should add a precondition error for a document.edit action with no patches when document is not found', () => {
    // Both published and draft documents are present as null.
    const state = createState(
      {
        [getPublishedId('doc1')]: {local: null},
        [getDraftId('doc1')]: {local: null},
      },
      defaultGrants,
    )
    const actions: DocumentAction[] = [
      {documentId: 'doc1', documentType: 'book', type: 'document.edit'},
    ]
    const result = calculatePermissions({instance, state}, actions)
    expect(result).toBeDefined()
    expect(result?.allowed).toBe(false)
    expect(result?.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'precondition',
          message: expect.stringContaining('could not be found'),
          documentId: 'doc1',
        }),
      ]),
    )
  })

  it('should add an access error for a document.edit action with no patches when update permission is denied', () => {
    const deniedGrants = {...defaultGrants, update: alwaysDeny}
    const state = createState(
      {
        [getPublishedId('doc1')]: {local: createDoc('doc1', 'Title')},
        [getDraftId('doc1')]: {local: createDoc(getDraftId('doc1'), 'Draft Title')},
      },
      deniedGrants,
    )
    const actions: DocumentAction[] = [
      {documentId: 'doc1', documentType: 'book', type: 'document.edit'},
    ]
    const result = calculatePermissions({instance, state}, actions)
    expect(result).toBeDefined()
    expect(result?.allowed).toBe(false)
    expect(result?.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'access',
          message: expect.stringContaining(
            'You are not allowed to edit the document with ID "doc1"',
          ),
          documentId: 'doc1',
        }),
      ]),
    )
  })

  it('should return undefined if grants are not provided', () => {
    const state = createState({
      [getPublishedId('doc1')]: {local: createDoc('doc1', 'Title')},
      [getDraftId('doc1')]: {local: null},
    })
    const actions: DocumentAction[] = [
      {documentId: 'doc1', type: 'document.create', documentType: 'article'},
    ]
    expect(calculatePermissions({instance, state}, actions)).toBeUndefined()
  })

  it('should catch ActionError from processActions and return a precondition error reason', () => {
    // For document.delete, if the published document is missing, processActions throws an ActionError.
    const state = createState(
      {
        [getPublishedId('doc1')]: {local: null},
        [getDraftId('doc1')]: {local: null},
      },
      defaultGrants,
    )
    const actions: DocumentAction[] = [
      {documentId: 'doc1', documentType: 'book', type: 'document.delete'},
    ]
    const result = calculatePermissions({instance, state}, actions)
    expect(result).toBeDefined()
    expect(result?.allowed).toBe(false)
    expect(result?.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'precondition',
          message: expect.stringContaining('The document you are trying to delete does not exist'),
          documentId: 'doc1',
        }),
      ]),
    )
  })

  it('should memoize the result for identical state and actions inputs', () => {
    const state = createState(
      {
        [getPublishedId('doc1')]: {local: createDoc('doc1', 'Title')},
        [getDraftId('doc1')]: {local: null},
      },
      defaultGrants,
    )
    const action: DocumentAction = {
      documentId: 'doc1',
      type: 'document.create',
      documentType: 'article',
    }
    // notice how the action is a copy
    const result1 = calculatePermissions({instance, state}, [{...action}])
    const result2 = calculatePermissions({instance, state}, [{...action}])
    expect(result1).toBe(result2)
  })
})
