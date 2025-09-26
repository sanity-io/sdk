import {
  type BaseActionOptions,
  type FilteredResponseQueryOptions,
  type ListenEvent,
  type MultipleActionResult,
  type MutationEvent,
  type RawQueryResponse,
  type ResponseQueryOptions,
  type SanityClient,
  type SingleActionResult,
  type UnfilteredResponseQueryOptions,
  type WelcomeEvent,
} from '@sanity/client'
import {diffValue} from '@sanity/diff-patch'
import {type Mutation, type SanityDocument} from '@sanity/types'
import {evaluate, parse} from 'groq-js'
import {delay, first, firstValueFrom, from, Observable, of, ReplaySubject, Subject} from 'rxjs'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createDocumentHandle} from '../config/handles'
import {sourceFor} from '../config/sanityConfig'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getDraftId, getPublishedId} from '../utils/ids'
import {
  createDocument,
  deleteDocument,
  discardDocument,
  editDocument,
  publishDocument,
  unpublishDocument,
} from './actions'
import {applyDocumentActions} from './applyDocumentActions'
import {
  getDocumentState,
  getDocumentSyncStatus,
  getPermissionsState,
  resolveDocument,
  resolvePermissions,
  subscribeDocumentEvents,
} from './documentStore'
import {type ActionErrorEvent, type TransactionRevertedEvent} from './events'
import {type DatasetAcl} from './permissions'
import {type DocumentSet, processMutations} from './processMutations'
import {type HttpAction} from './reducers'
import {createFetchDocument, createSharedListener} from './sharedListener'

// Define a single generic TestDocument type
interface TestDocument extends SanityDocument {
  _type: 'article'
  title?: string
}

// Scope the TestDocument type to the project/datasets used in tests
type AllTestSchemaTypes = TestDocument

// Augment the 'groq' module
declare module 'groq' {
  interface SanitySchemas {
    default: AllTestSchemaTypes
  }
}

let instance: SanityInstance
let instance1: SanityInstance
let instance2: SanityInstance

const source = sourceFor({projectId: 'p', dataset: 'd'})
const source1 = sourceFor({projectId: 'p', dataset: 'd1'})
const source2 = sourceFor({projectId: 'p', dataset: 'd2'})

beforeEach(() => {
  instance = createSanityInstance()
  // test uses two instances that share the same in-memory dataset, but separate
  // store instances. in real scenarios, this would be separate machines but with
  // the same project + dataset
  instance1 = createSanityInstance()
  instance2 = createSanityInstance()
})

afterEach(() => {
  instance?.dispose()
  instance1?.dispose()
  instance2?.dispose()
})

it('creates, edits, and publishes a document', async () => {
  const doc = {documentId: 'doc-single', documentType: 'article', source}
  const documentState = getDocumentState(instance, doc)

  // Initially the document is undefined
  expect(documentState.getCurrent()).toBeUndefined()

  const unsubscribe = documentState.subscribe()

  // Create a new document
  const {appeared} = await applyDocumentActions(instance, {actions: [createDocument(doc)], source})
  expect(appeared).toContain(getDraftId(doc.documentId))

  let currentDoc = documentState.getCurrent()
  expect(currentDoc?._id).toEqual(getDraftId(doc.documentId))

  // Edit the document – add a title
  await applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'My First Article'}})],
    source,
  })
  currentDoc = documentState.getCurrent()
  expect(currentDoc?.title).toEqual('My First Article')

  // Publish the document; the resulting transactionId is used as the new _rev
  const {transactionId, submitted} = await applyDocumentActions(instance, {
    actions: [publishDocument(doc)],
    source,
  })
  await submitted()
  currentDoc = documentState.getCurrent()

  expect(currentDoc).toMatchObject({_id: doc.documentId, _rev: transactionId})
  unsubscribe()
})

it('edits existing documents', async () => {
  const doc = {documentId: 'existing-doc', documentType: 'article', source}
  const state = getDocumentState(instance, doc)

  // not subscribed yet so the value is undefined
  expect(state.getCurrent()).toBeUndefined()

  const unsubscribe = state.subscribe()

  // wait for it to populate
  await firstValueFrom(state.observable.pipe(first((i) => !!i)))

  expect(state.getCurrent()).toMatchObject({
    _id: getDraftId(doc.documentId),
    title: 'existing doc',
  })

  await applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'updated title'}})],
    source,
  })
  expect(state.getCurrent()).toMatchObject({
    _id: getDraftId(doc.documentId),
    title: 'updated title',
  })

  unsubscribe()
})

it('sets optimistic changes synchronously', async () => {
  const doc = {documentId: 'optimistic', documentType: 'article'}

  const state1 = getDocumentState(instance1, {...doc, source: source1})
  const state2 = getDocumentState(instance2, {...doc, source: source2})

  const unsubscribe1 = state1.subscribe()
  const unsubscribe2 = state2.subscribe()

  // wait until the value is primed in the store
  await resolveDocument(instance1, {...doc, source: source1})

  // then the actions are synchronous
  expect(state1.getCurrent()).toBeNull()
  applyDocumentActions(instance1, {actions: [createDocument(doc)], source: source1})
  expect(state1.getCurrent()).toMatchObject({_id: getDraftId(doc.documentId)})
  const actionResult1Promise = applyDocumentActions(instance1, {
    actions: [editDocument(doc, {set: {title: 'initial title'}})],
    source: source1,
  })
  expect(state1.getCurrent()?.title).toBe('initial title')

  // notice how state2 doesn't have the value yet because it's a different
  // instance and the value needs to come over the mock network
  expect(state2.getCurrent()?.title).toBe(undefined)

  // after we await the action result, it still shouldn't be submitted yet
  // so `state2` should still be undefined
  const actionResult1 = await actionResult1Promise
  expect(state2.getCurrent()?.title).toBe(undefined)

  // if we await until the action is fully submitted, then it should show up
  // in the other instance
  await actionResult1.submitted()
  expect(state2.getCurrent()?.title).toBe('initial title')

  // synchronous for state 2
  const actionResult2Promise = applyDocumentActions(instance2, {
    actions: [editDocument(doc, {set: {title: 'updated title'}})],
    source: source2,
  })
  expect(state2.getCurrent()?.title).toBe('updated title')
  // async for state 1
  expect(state1.getCurrent()?.title).toBe('initial title')

  const actionResult2 = await actionResult2Promise
  await actionResult2.submitted()
  expect(state1.getCurrent()?.title).toBe('updated title')

  unsubscribe1()
  unsubscribe2()
})

it('propagates changes between two instances', async () => {
  const doc = {documentId: 'doc-collab', documentType: 'article'}
  const state1 = getDocumentState(instance1, {...doc, source: source1})
  const state2 = getDocumentState(instance2, {...doc, source: source2})

  const state1Unsubscribe = state1.subscribe()
  const state2Unsubscribe = state2.subscribe()

  // Create the document from instance1.
  await applyDocumentActions(instance1, {actions: [createDocument(doc)], source: source1}).then(
    (r) => r.submitted(),
  )

  const doc1 = state1.getCurrent()
  const doc2 = state2.getCurrent()
  expect(doc1?._id).toEqual(getDraftId(doc.documentId))
  expect(doc2?._id).toEqual(getDraftId(doc.documentId))

  // Now, edit the document from instance2.
  await applyDocumentActions(instance2, {
    actions: [editDocument(doc, {set: {title: 'Hello world!'}})],
    source: source2,
  }).then((r) => r.submitted())

  const updated1 = state1.getCurrent()
  const updated2 = state2.getCurrent()
  expect(updated1?.title).toEqual('Hello world!')
  expect(updated2?.title).toEqual('Hello world!')

  state1Unsubscribe()
  state2Unsubscribe()
})

it('handles concurrent edits and resolves conflicts', async () => {
  const doc = {documentId: 'doc-concurrent', documentType: 'article'}
  const state1 = getDocumentState(instance1, {...doc, source: source1})
  const state2 = getDocumentState(instance2, {...doc, source: source2})

  const state1Unsubscribe = state1.subscribe()
  const state2Unsubscribe = state2.subscribe()

  const oneOffInstance = createSanityInstance()

  // Create the initial document from a one-off instance.
  await applyDocumentActions(oneOffInstance, {
    actions: [
      createDocument(doc),
      editDocument(doc, {set: {title: 'The quick brown fox jumps over the lazy dog'}}),
    ],
    source,
  }).then((res) => res.submitted())

  // Both instances now issue an edit simultaneously.
  const p1 = applyDocumentActions(instance1, {
    actions: [editDocument(doc, {set: {title: 'The quick brown fox jumps over the lazy cat'}})],
    source: source1,
  }).then((r) => r.submitted())
  const p2 = applyDocumentActions(instance2, {
    actions: [
      editDocument(doc, {set: {title: 'The quick brown elephant jumps over the lazy dog'}}),
    ],
    source: source2,
  }).then((r) => r.submitted())

  // Wait for both actions to complete (or reject).
  await Promise.allSettled([p1, p2])

  const finalDoc1 = state1.getCurrent()
  const finalDoc2 = state2.getCurrent()
  expect(finalDoc1?.title).toEqual(finalDoc2?.title)
  expect(finalDoc1?.title).toBe('The quick brown elephant jumps over the lazy cat')

  state1Unsubscribe()
  state2Unsubscribe()
  oneOffInstance.dispose()
})

it('unpublishes and discards a document', async () => {
  const doc = {documentId: 'doc-pub-unpub', documentType: 'article', source}
  const documentState = getDocumentState(instance, doc)
  const unsubscribe = documentState.subscribe()

  // Create and publish the document.
  await applyDocumentActions(instance, {actions: [createDocument(doc)], source})
  const afterPublish = await applyDocumentActions(instance, {
    actions: [publishDocument(doc)],
    source,
  })
  const publishedDoc = documentState.getCurrent()
  expect(publishedDoc).toMatchObject({
    _id: getPublishedId(doc.documentId),
    _rev: afterPublish.transactionId,
  })

  // Unpublish the document (which should delete the published version and create a draft).
  await applyDocumentActions(instance, {actions: [unpublishDocument(doc)], source})
  const afterUnpublish = documentState.getCurrent()
  // In our mock implementation the _id remains the same but the published copy is removed.
  expect(afterUnpublish?._id).toEqual(getDraftId(doc.documentId))

  // Discard the draft (which deletes the draft version).
  await applyDocumentActions(instance, {actions: [discardDocument(doc)], source})
  const afterDiscard = documentState.getCurrent()
  expect(afterDiscard).toBeNull()

  unsubscribe()
})

it('deletes a document', async () => {
  const doc = {documentId: 'doc-delete', documentType: 'article', source}

  const documentState = getDocumentState(instance, doc)
  const unsubscribe = documentState.subscribe()

  await applyDocumentActions(instance, {
    actions: [createDocument(doc), publishDocument(doc)],
    source,
  })
  const docValue = documentState.getCurrent()
  expect(docValue).toBeDefined()

  // Delete the document.
  await applyDocumentActions(instance, {actions: [deleteDocument(doc)], source})
  const afterDelete = documentState.getCurrent()
  expect(afterDelete).toBeNull()

  unsubscribe()
})

it('cleans up document state when there are no subscribers', async () => {
  const doc = {documentId: 'doc-cleanup', documentType: 'article', source}
  const documentState = getDocumentState(instance, doc)

  // Subscribe to the document state.
  const unsubscribe = documentState.subscribe()

  // Create a document.
  await applyDocumentActions(instance, {actions: [createDocument(doc)], source})
  expect(documentState.getCurrent()).toBeDefined()

  // Unsubscribe from the document.

  unsubscribe()

  // Wait longer than DOCUMENT_STATE_CLEAR_DELAY (our mock sets it to 25ms)
  await new Promise((resolve) => setTimeout(resolve, 30))

  // When a new subscriber is created, if the state was cleared it should return undefined.
  const newDocumentState = getDocumentState(instance, doc)
  expect(newDocumentState.getCurrent()).toBeUndefined()
})

it('fetches documents if there are no active subscriptions for the actions applied', async () => {
  const doc = {documentId: 'existing-doc', documentType: 'article', source}

  const {getCurrent} = getDocumentState(instance, doc)
  expect(getCurrent()).toBeUndefined()
  expect(getDocumentSyncStatus(instance, doc).getCurrent()).toBeUndefined()

  // there are no active subscriptions so applying this action will create one
  // for this action. this subscription will be removed when the outgoing
  // transaction for this action has been accepted by the server
  const setNewTitle = applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'new title'}})],
    source,
  })
  expect(getCurrent()?.title).toBeUndefined()
  expect(getDocumentSyncStatus(instance, doc).getCurrent()).toBe(false)

  await setNewTitle
  expect(getCurrent()?.title).toBe('new title')

  // there is an active subscriber now so the edits are synchronous
  applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'updated title'}})],
    source,
  })
  expect(getCurrent()?.title).toBe('updated title')
  applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'updated title!'}})],
    source,
  })
  expect(getCurrent()?.title).toBe('updated title!')

  expect(getDocumentSyncStatus(instance, doc).getCurrent()).toBe(false)

  // await submitted in order to test that there is no subscriptions
  const result = await applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'updated title'}})],
    source,
  })
  await result.submitted()

  // test that there isn't any document state
  expect(getDocumentSyncStatus(instance, doc).getCurrent()).toBeUndefined()

  const setNewNewTitle = applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'new new title'}})],
    source,
  })
  // now we'll have to await again
  expect(getCurrent()?.title).toBe(undefined)

  await setNewNewTitle
  expect(getCurrent()?.title).toBe('new new title')
})

it('batches edit transaction into one outgoing transaction', async () => {
  const doc = {documentId: crypto.randomUUID(), documentType: 'article', source}

  const unsubscribe = getDocumentState(instance, doc).subscribe()

  // this creates its own transaction
  applyDocumentActions(instance, {actions: [createDocument(doc)], source})

  // these get batched into one
  applyDocumentActions(instance, {actions: [editDocument(doc, {set: {title: 'name!'}})], source})
  applyDocumentActions(instance, {actions: [editDocument(doc, {set: {title: 'name!!'}})], source})
  applyDocumentActions(instance, {actions: [editDocument(doc, {set: {title: 'name!!!'}})], source})
  const res = await applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'name!!!!'}})],
    source,
  })
  await res.submitted()

  expect(client.action).toHaveBeenCalledTimes(2)
  const [, [_actions]] = vi.mocked(client.action).mock.calls
  const actions = Array.isArray(_actions) ? _actions : [_actions]
  expect(actions.length > 0).toBe(true)
  expect(actions.every(({actionType}) => actionType === 'sanity.action.document.edit')).toBe(true)

  unsubscribe()
})

it('provides the consistency status via `getDocumentSyncStatus`', async () => {
  const doc = {documentId: crypto.randomUUID(), documentType: 'article', source}

  const syncStatus = getDocumentSyncStatus(instance, doc)
  expect(syncStatus.getCurrent()).toBeUndefined()

  const unsubscribe = syncStatus.subscribe()
  expect(syncStatus.getCurrent()).toBe(true)

  const applied = applyDocumentActions(instance, {actions: [createDocument(doc)], source})
  expect(syncStatus.getCurrent()).toBe(false)

  const createResult = await applied
  expect(syncStatus.getCurrent()).toBe(false)

  await createResult.submitted()
  expect(syncStatus.getCurrent()).toBe(true)

  applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'initial name'}})],
    source,
  })
  expect(syncStatus.getCurrent()).toBe(false)

  applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'updated name'}})],
    source,
  })
  const publishResult = applyDocumentActions(instance, {actions: [publishDocument(doc)], source})
  expect(syncStatus.getCurrent()).toBe(false)
  await publishResult.then((res) => res.submitted())
  expect(syncStatus.getCurrent()).toBe(true)

  unsubscribe()
})

it('reverts failed outgoing transaction locally', async () => {
  const clientActionMockImplementation = vi.mocked(client.action).getMockImplementation()!
  vi.mocked(client.action).mockImplementation(async (...args) => {
    const [, {transactionId} = {}] = args
    if (transactionId === 'force-revert') throw new Error('example error')
    return await clientActionMockImplementation(...args)
  })

  const revertedEventPromise = new Promise<TransactionRevertedEvent>((resolve) => {
    const unsubscribe = subscribeDocumentEvents(instance, {
      onEvent: (e) => {
        if (e.type === 'reverted') {
          resolve(e)
          unsubscribe()
        }
      },
      source,
    })
  })

  const doc = {documentId: crypto.randomUUID(), documentType: 'article', source}

  const {getCurrent, subscribe} = getDocumentState(instance, doc)
  const unsubscribe = subscribe()

  await applyDocumentActions(instance, {actions: [createDocument(doc)], source})
  applyDocumentActions(instance, {actions: [editDocument(doc, {set: {title: 'the'}})], source})
  applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'the quick'}})],
    source,
  })

  // this edit action is simulated to fail from the backend and will be reverted
  const revertedActionResult = applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'the quick brown'}})],
    source,
    transactionId: 'force-revert',
    disableBatching: true,
  })

  applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'the quick brown fox'}})],
    source,
  })
  await applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'the quick brown fox jumps'}})],
    source,
  }).then((e) => e.submitted())

  await expect(revertedEventPromise).resolves.toMatchObject({
    type: 'reverted',
    message: 'example error',
    outgoing: {transactionId: 'force-revert'},
  })

  // test that the submitted handler also rejects
  await expect(revertedActionResult.then((e) => e.submitted())).rejects.toThrowError(
    /example error/,
  )

  // notice how `brown ` is gone
  expect(getCurrent()?.title).toBe('the quick fox jumps')

  // check that we can still edit after recovering from the error
  applyDocumentActions(instance, {
    actions: [editDocument(doc, {set: {title: 'TEST the quick fox jumps'}})],
    source,
  })
  expect(getCurrent()?.title).toBe('TEST the quick fox jumps')

  unsubscribe()
  vi.mocked(client.action).mockImplementation(clientActionMockImplementation)
})

it('removes a queued transaction if it fails to apply', async () => {
  const actionErrorEventPromise = new Promise<ActionErrorEvent>((resolve) => {
    const unsubscribe = subscribeDocumentEvents(instance, {
      onEvent: (e) => {
        if (e.type === 'error') {
          resolve(e)
          unsubscribe()
        }
      },
      source,
    })
  })

  const doc = {documentId: crypto.randomUUID(), documentType: 'article', source}
  const state = getDocumentState(instance, doc)
  const unsubscribe = state.subscribe()

  await expect(
    applyDocumentActions(instance, {
      actions: [editDocument(doc, {set: {title: "can't set"}})],
      source,
    }),
  ).rejects.toThrowError(/Cannot edit document/)

  await expect(actionErrorEventPromise).resolves.toMatchObject({
    documentId: doc.documentId,
    type: 'error',
    message: expect.stringContaining('Cannot edit document'),
  })

  // editing should still work after though (no crashing)
  await applyDocumentActions(instance, {actions: [createDocument(doc)], source})
  applyDocumentActions(instance, {actions: [editDocument(doc, {set: {title: 'can set!'}})], source})

  expect(state.getCurrent()?.title).toBe('can set!')

  unsubscribe()
})

it('returns allowed true when no permission errors occur', async () => {
  // Simulate a dataset ACL that allows all permissions.
  const datasetAcl = [{filter: 'true', permissions: ['read', 'update', 'create', 'history']}]
  // Override the client mock to return our dataset ACL.
  client.observable.request = vi.fn().mockReturnValue(of(datasetAcl))

  // Create a document and subscribe to it.
  const doc = {
    documentId: 'doc-perm-allowed',
    documentType: 'article',
    source,
  }
  const state = getDocumentState(instance, doc)
  const unsubscribe = state.subscribe()
  await applyDocumentActions(instance, {actions: [createDocument(doc)], source}).then((r) =>
    r.submitted(),
  )

  // Use an action that includes a patch (so that update permission check is bypassed).
  const permissionsState = getPermissionsState(instance, {
    actions: [
      {
        ...doc,
        type: 'document.edit',
        patches: [{set: {title: 'New Title'}}],
      },
    ],
    source,
  })
  // Wait briefly to allow permissions calculation.
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(permissionsState.getCurrent()).toEqual({allowed: true})

  unsubscribe()
})

it("should reject applying the action if a precondition isn't met", async () => {
  const doc = createDocumentHandle({documentId: 'does-not-exist', documentType: 'article'})

  await expect(
    applyDocumentActions(instance, {actions: [deleteDocument(doc)], source}),
  ).rejects.toThrow('The document you are trying to delete does not exist.')
})

it("should reject applying the action if a permission isn't met", async () => {
  const doc = createDocumentHandle({documentId: 'does-not-exist', documentType: 'article'})

  const datasetAcl = [{filter: 'false', permissions: ['create']}]
  vi.mocked(client.request).mockResolvedValue(datasetAcl)

  await expect(
    applyDocumentActions(instance, {actions: [createDocument(doc)], source}),
  ).rejects.toThrow('You do not have permission to create a draft for document "does-not-exist".')
})

it('returns allowed false with reasons when permission errors occur', async () => {
  const datasetAcl = [{filter: 'false', permissions: ['create']}]
  vi.mocked(client.request).mockResolvedValue(datasetAcl)

  const doc = createDocumentHandle({documentId: 'doc-perm-denied', documentType: 'article'})
  const result = await resolvePermissions(instance, {actions: [createDocument(doc)], source})

  const message = 'You do not have permission to create a draft for document "doc-perm-denied".'
  expect(result).toMatchObject({
    allowed: false,
    message,
    reasons: [{message, documentId: 'doc-perm-denied', type: 'access'}],
  })
})

it('fetches dataset ACL and updates grants in the document store state', async () => {
  // Simulate a dataset ACL response.
  const datasetAcl = [
    {filter: '_type=="book"', permissions: ['read', 'update', 'create']},
    {filter: '_type=="author"', permissions: ['update']},
  ]
  vi.mocked(client.request).mockResolvedValue(datasetAcl)

  const book = createDocumentHandle({documentId: crypto.randomUUID(), documentType: 'book'})
  const author = createDocumentHandle({documentId: crypto.randomUUID(), documentType: 'author'})

  expect(await resolvePermissions(instance, {actions: [createDocument(book)], source})).toEqual({
    allowed: true,
  })
  expect(
    await resolvePermissions(instance, {actions: [createDocument(author)], source}),
  ).toMatchObject({
    allowed: false,
    message: expect.stringContaining('You do not have permission to create a draft for document'),
  })
})

it('returns a promise that resolves when a document has been loaded in the store (useful for suspense)', async () => {
  const doc = {documentId: crypto.randomUUID(), documentType: 'article', source}

  expect(await resolveDocument(instance, doc)).toBe(null)

  // use one-off instance to create the document in the mock backend
  const oneOffInstance = createSanityInstance()
  const result = await applyDocumentActions(oneOffInstance, {
    actions: [createDocument(doc), editDocument(doc, {set: {title: 'initial title'}})],
    source,
  })
  await result.submitted() // wait till submitted to server before resolving

  await expect(resolveDocument(instance, doc)).resolves.toMatchObject({
    _id: getDraftId(doc.documentId),
    _type: 'article',
    title: 'initial title',
  })
  oneOffInstance.dispose()
})

it('emits an event for each action after an outgoing transaction has been accepted', async () => {
  const handler = vi.fn()
  const unsubscribe = subscribeDocumentEvents(instance, {onEvent: handler, source})

  const documentId = crypto.randomUUID()
  const doc = createDocumentHandle({documentId, documentType: 'article'})
  expect(handler).toHaveBeenCalledTimes(0)

  const tnx1 = await applyDocumentActions(instance, {
    actions: [
      createDocument(doc),
      editDocument(doc, {set: {title: 'new name'}}),
      publishDocument(doc),
    ],
    source,
  }).then((e) => e.submitted())
  expect(handler).toHaveBeenCalledTimes(4)

  const tnx2 = await applyDocumentActions(instance, {
    actions: [
      unpublishDocument(doc),
      publishDocument(doc),
      editDocument(doc, {set: {title: 'updated name'}}),
      discardDocument(doc),
    ],
    source,
  }).then((e) => e.submitted())
  expect(handler).toHaveBeenCalledTimes(9)

  expect(handler.mock.calls).toMatchObject([
    [{documentId, type: 'created', outgoing: {transactionId: tnx1.transactionId}}],
    [{documentId, type: 'edited', outgoing: {transactionId: tnx1.transactionId}}],
    [{documentId, type: 'published', outgoing: {transactionId: tnx1.transactionId}}],
    [{type: 'accepted', outgoing: {transactionId: tnx1.transactionId}}],
    [{documentId, type: 'unpublished', outgoing: {transactionId: tnx2.transactionId}}],
    [{documentId, type: 'published', outgoing: {transactionId: tnx2.transactionId}}],
    [{documentId, type: 'edited', outgoing: {transactionId: tnx2.transactionId}}],
    [{documentId, type: 'discarded', outgoing: {transactionId: tnx2.transactionId}}],
    [{type: 'accepted', outgoing: {transactionId: tnx2.transactionId}}],
  ])

  await applyDocumentActions(instance, {actions: [deleteDocument(doc)], source})

  unsubscribe()
})

vi.mock('../client/clientStore.ts', () => ({
  getClientState: vi.fn().mockReturnValue({observable: new ReplaySubject(1)}),
}))

vi.mock('./sharedListener.ts', () => {
  const sharedListener = new Subject<ListenEvent<SanityDocument>>()
  const welcomeEvent: WelcomeEvent = {type: 'welcome', listenerName: 'mock-listener'}

  return {
    createFetchDocument: vi.fn(),
    createSharedListener: vi.fn().mockReturnValue({
      dispose: vi.fn(),
      events: Object.assign(
        new Observable((observer) => {
          observer.next(welcomeEvent)
          return sharedListener.subscribe(observer)
        }),
        {
          next: sharedListener.next.bind(sharedListener),
          complete: sharedListener.complete.bind(sharedListener),
          error: sharedListener.error.bind(sharedListener),
        },
      ),
    }),
  }
})

vi.mock('./documentConstants.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./documentConstants')>()
  return {
    ...original,
    INITIAL_OUTGOING_THROTTLE_TIME: 0,
    DOCUMENT_STATE_CLEAR_DELAY: 25,
  }
})

let client: SanityClient

beforeEach(() => {
  const client$ = (getClientState as () => StateSource<SanityClient>)()
    .observable as ReplaySubject<SanityClient>
  const sharedListener = (
    createSharedListener as () => {
      dispose: () => void
      events: Subject<ListenEvent<SanityDocument>>
    }
  )()

  let documents: DocumentSet = {
    [getDraftId('existing-doc')]: {
      _id: getDraftId('existing-doc'),
      _createdAt: '2025-02-06T06:43:46.236Z',
      _updatedAt: '2025-02-06T06:43:46.236Z',
      _rev: 'initial-rev',
      _type: 'book',
      title: 'existing doc',
    },
  }

  vi.mocked(createFetchDocument).mockReturnValue(
    vi.fn((id) =>
      of(documents[id] ?? null).pipe(
        // add a bit of delay to simulate async doc resolution
        delay(0),
      ),
    ),
  )

  const isNonNullable = <T>(t: T): t is NonNullable<T> => !!t

  const fetch = vi.fn(
    async (
      query: string,
      params?: Record<string, unknown>,
      options:
        | ResponseQueryOptions
        | FilteredResponseQueryOptions
        | UnfilteredResponseQueryOptions = {},
    ) => {
      const start = performance.now()
      const root = parse(query)
      const value = await evaluate(root, {
        dataset: Object.values(documents).filter(isNonNullable),
        params,
      })
      const result = await value.get()

      let returnQuery
      if ('returnQuery' in options) {
        returnQuery = options.returnQuery
      } else {
        returnQuery = true
      }

      let filterResponse
      if ('filterResponse' in options) {
        filterResponse = options.filterResponse
      } else {
        filterResponse = false
      }

      if (!filterResponse) {
        const response: RawQueryResponse<unknown> = {
          ms: performance.now() - start,
          ...(returnQuery && {query}),
          result,
          query,
        }

        return response
      }

      return result
    },
  ) as SanityClient['fetch']

  const action = vi.fn(
    async (
      input: HttpAction | HttpAction[],
      {transactionId = crypto.randomUUID(), dryRun}: BaseActionOptions,
    ): Promise<SingleActionResult | MultipleActionResult> => {
      const actions = Array.isArray(input) ? input : [input]
      let next: DocumentSet = {...documents}
      const timestamp = new Date().toISOString()

      for (const i of actions) {
        switch (i.actionType) {
          case 'sanity.action.document.delete': {
            const allIds: string[] = await fetch('sanity::versionOf($id)', {id: i.publishedId})
            const draftIds = allIds.filter((id) => id !== i.publishedId)
            const draftsToDelete = new Set(i.includeDrafts)

            if (!draftIds.every((id) => draftsToDelete.has(id))) {
              throw new Error(
                `Found draft ids: \`${draftIds.join(',')}\` that were not included in action's \`includeDrafts\``,
              )
            }

            next = processMutations({
              documents: next,
              mutations: allIds.map((id) => ({delete: {id}})),
              transactionId,
              timestamp,
            })

            continue
          }
          case 'sanity.action.document.edit': {
            const sourceDoc = next[i.draftId] ?? next[i.publishedId]
            if (!sourceDoc) {
              throw new Error(
                `Could not find a document to edit from \`draftId\` \`${i.draftId}\` or \`publishedId\` ${i.publishedId}`,
              )
            }

            next = processMutations({
              documents: next,
              mutations: [
                {createIfNotExists: {...sourceDoc, _id: i.draftId}},
                {patch: {id: i.draftId, ...i.patch}},
              ],
              transactionId,
              timestamp,
            })

            continue
          }
          case 'sanity.action.document.publish': {
            const draft = next[i.draftId]
            if (!draft) {
              throw new Error(
                `Could not publish document because draft document with ID \`${i.draftId}\` was not found.`,
              )
            }

            next = processMutations({
              documents: next,
              mutations: [
                {delete: {id: i.draftId}},
                {createOrReplace: {...draft, _id: i.publishedId}},
              ],
              transactionId,
              timestamp,
            })

            continue
          }
          case 'sanity.action.document.unpublish': {
            const published = next[i.publishedId]
            if (!published) {
              throw new Error(
                `Could not unpublish because published document with ID \`${i.publishedId}\` was not found.`,
              )
            }

            next = processMutations({
              documents: next,
              mutations: [
                {delete: {id: i.publishedId}},
                {createIfNotExists: {...published, _id: i.draftId}},
              ],
              transactionId,
              timestamp,
            })

            continue
          }
          case 'sanity.action.document.version.create': {
            if (next[i.attributes._id]) {
              throw new Error(
                `Could not create version with ID \`${i.attributes._id}\` because it already exists.`,
              )
            }

            next = processMutations({
              documents: next,
              mutations: [{create: i.attributes}],
              transactionId,
              timestamp,
            })

            continue
          }
          case 'sanity.action.document.version.discard': {
            if (!next[i.versionId]) {
              throw new Error(
                `Cannot discard document version with ID \`${i.versionId}\` because it was not found.`,
              )
            }

            next = processMutations({
              documents: next,
              mutations: [{delete: {id: i.versionId}}],
              transactionId,
              timestamp,
            })

            continue
          }
          default: {
            throw new Error(
              `Unsupported action for mock backend: ${
                // @ts-expect-error unexpected input
                i.actionType
              }`,
            )
          }
        }
      }

      if (!dryRun) {
        const existingIds = new Set(
          Object.entries(documents)
            .filter(([, value]) => !!value)
            .map(([key]) => key),
        )
        const resultingIds = new Set(
          Object.entries(next)
            .filter(([, value]) => !!value)
            .map(([key]) => key),
        )
        const allKeys = new Set([...existingIds, ...resultingIds])

        const {appeared, disappeared, updated} = Array.from(allKeys).reduce<{
          updated: string[]
          appeared: string[]
          disappeared: string[]
        }>(
          (acc, id) => {
            if (existingIds.has(id) && resultingIds.has(id)) {
              acc.updated.push(id)
            } else if (!existingIds.has(id) && resultingIds.has(id)) {
              acc.appeared.push(id)
            } else if (!resultingIds.has(id) && existingIds.has(id)) {
              acc.disappeared.push(id)
            }
            return acc
          },
          {updated: [], appeared: [], disappeared: []},
        )

        const transactionTotalEvents = appeared.length + disappeared.length + updated.length
        let transactionCurrentEvent = 0

        const mutationEvents: MutationEvent[] = []

        for (const id of appeared) {
          transactionCurrentEvent++ // index seems to start at 1
          const nextDoc = next[id]!
          mutationEvents.push({
            type: 'mutation',
            documentId: id,
            eventId: `${transactionId}#${id}`,
            identity: 'example-user',
            mutations: [{create: nextDoc}],
            timestamp,
            transactionId,
            transactionCurrentEvent,
            transactionTotalEvents,
            transition: 'appear',
            visibility: 'query',
            resultRev: transactionId,
          })
        }

        for (const id of updated) {
          transactionCurrentEvent++
          const prevDoc = documents[id]!
          const nextDoc = next[id]!

          mutationEvents.push({
            type: 'mutation',
            documentId: id,
            eventId: `${transactionId}#${id}`,
            identity: 'example-user',
            mutations: diffValue(prevDoc, nextDoc).map(
              (patch): Mutation => ({patch: {...patch, id}}),
            ),
            timestamp,
            transactionCurrentEvent,
            transactionTotalEvents,
            transactionId,
            transition: 'update',
            visibility: 'query',
            previousRev: prevDoc._rev,
            resultRev: transactionId,
          })
        }

        for (const id of disappeared) {
          transactionCurrentEvent++
          const prevDoc = documents[id]!
          mutationEvents.push({
            type: 'mutation',
            documentId: id,
            eventId: `${transactionId}#${id}`,
            identity: 'example-user',
            mutations: [{delete: {id}}],
            timestamp,
            transactionId,
            transactionCurrentEvent,
            transactionTotalEvents,
            transition: 'disappear',
            visibility: 'query',
            previousRev: prevDoc._rev,
          })
        }

        documents = next

        for (const mutationEvent of mutationEvents) {
          sharedListener.events.next(mutationEvent)
        }
      }

      // add a tick for realism
      await new Promise((resolve) => setTimeout(resolve, 0))

      return {transactionId}
    },
  ) as SanityClient['action']

  const datasetAcl: DatasetAcl = [
    {filter: 'true', permissions: ['create', 'history', 'read', 'update']},
  ]
  const request = vi.fn(async () => {
    // add a bit of delay to simulate race conditions
    await new Promise((resolve) => setTimeout(resolve, 10))
    return datasetAcl
  }) as SanityClient['request']

  client = {
    action,
    fetch,
    request,
    observable: {
      action: (...args: Parameters<typeof action>) => from(action(...args)),
      fetch: (...args: Parameters<typeof fetch>) => from(fetch(...args)),
      request: (...args: Parameters<typeof request>) => from(request(...args)),
    },
  } as SanityClient
  client$.next(client)
})
