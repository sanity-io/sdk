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
import {type Mutation, type SanityDocument} from '@sanity/types'
import {evaluate, parse} from 'groq-js'
import {delay, first, firstValueFrom, from, Observable, of, ReplaySubject, Subject} from 'rxjs'
import {beforeEach, it, vi} from 'vitest'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createSanityInstance} from '../instance/sanityInstance'
import {type SanityInstance} from '../instance/types'
import {getDraftId, getPublishedId} from '../preview/util'
import {getOrCreateResource} from '../resources/createResource'
import {
  createDocument,
  deleteDocument,
  discardDocument,
  editDocument,
  publishDocument,
  unpublishDocument,
} from './actions'
import {applyActions} from './applyActions'
import {diffPatch} from './diffPatch'
import {
  documentStore,
  getDocumentState,
  resolveDocument,
  subscribeDocumentEvents,
} from './documentStore'
import {type ActionErrorEvent, type TransactionRevertedEvent} from './events'
import {type DocumentHandle} from './patchOperations'
import {type DocumentSet, processMutations} from './processMutations'
import {type HttpAction} from './reducers'
import {createFetchDocument, createSharedListener} from './sharedListener'

vi.mock('../client/actions/getSubscribableClient', () => ({
  getSubscribableClient: vi.fn().mockReturnValue(new ReplaySubject(1)),
}))

vi.mock('./sharedListener.ts', () => {
  const sharedListener = new Subject<ListenEvent<SanityDocument>>()
  const welcomeEvent: WelcomeEvent = {type: 'welcome', listenerName: 'mock-listener'}

  return {
    createFetchDocument: vi.fn(),
    createSharedListener: vi.fn().mockReturnValue(
      Object.assign(
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
    ),
  }
})

vi.mock('./documentConstants.ts', () => ({
  INITIAL_OUTGOING_THROTTLE_TIME: 0,
  DOCUMENT_STATE_CLEAR_DELAY: 100,
}))

let client: SanityClient

beforeEach(() => {
  const client$ = (getSubscribableClient as () => ReplaySubject<SanityClient>)()
  const sharedListener = (createSharedListener as () => Subject<ListenEvent<SanityDocument>>)()

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
  )

  const action = vi.fn(
    async (
      input: HttpAction | HttpAction[],
      {transactionId = crypto.randomUUID(), dryRun}: BaseActionOptions,
    ): Promise<SingleActionResult | MultipleActionResult> => {
      const actions = Array.isArray(input) ? input : [input]
      let next: DocumentSet = {...documents}
      const timestamp = new Date().toISOString()

      // add a tick for realism

      for (const i of actions) {
        switch (i.actionType) {
          case 'sanity.action.document.delete': {
            const allIds: string[] = await fetch('sanity::versionsOf($id)', {id: i.publishedId})
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
            const source = next[i.draftId] ?? next[i.publishedId]
            if (!source) {
              throw new Error(
                `Could not find a document to edit from \`draftId\` \`${i.draftId}\` or \`publishedId\` ${i.publishedId}`,
              )
            }

            next = processMutations({
              documents: next,
              mutations: [
                {createIfNotExists: {...source, _id: i.draftId}},
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
            mutations: diffPatch(prevDoc, nextDoc).map(
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
          sharedListener.next(mutationEvent)
        }
      }

      // add a tick for realism
      await new Promise((resolve) => setTimeout(resolve, 0))

      return {transactionId}
    },
  )

  client = {
    action: action as SanityClient['action'],
    fetch: fetch as SanityClient['fetch'],
    observable: {
      action: (...args: Parameters<typeof action>) => from(action(...args)),
      fetch: (...args: Parameters<typeof fetch>) => from(fetch(...args)),
    },
  } as SanityClient
  client$.next(client)
})

function checkUnverified(instance: SanityInstance, docId: string) {
  const {state} = getOrCreateResource(instance, documentStore)
  const {documentStates} = state.get()
  expect(documentStates[getDraftId(docId)]?.unverifiedRevisions).toEqual({})
  expect(documentStates[getPublishedId(docId)]?.unverifiedRevisions).toEqual({})
}

describe('documentStore', () => {
  it('creates, edits, and publishes a document', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Article extends SanityDocument {
      title?: string
      _type: 'article'
    }

    const doc: DocumentHandle<Article> = {_id: 'doc-single', _type: 'article'}
    const documentState = getDocumentState(instance, doc)

    // Initially the document is undefined
    expect(documentState.getCurrent()).toBeUndefined()

    const unsubscribe = documentState.subscribe()

    // Create a new document
    await applyActions(instance, createDocument(doc))
    let currentDoc = documentState.getCurrent()
    expect(currentDoc?._id).toEqual(getDraftId(doc._id))

    // Edit the document – add a title
    await applyActions(instance, editDocument(doc, {set: {title: 'My First Article'}}))
    currentDoc = documentState.getCurrent()
    expect(currentDoc?.title).toEqual('My First Article')

    // Publish the document; the resulting transactionId is used as the new _rev
    const {transactionId, submitted} = await applyActions(instance, publishDocument(doc))
    await submitted()
    currentDoc = documentState.getCurrent()

    expect(currentDoc).toMatchObject({_id: doc._id, _rev: transactionId})
    unsubscribe()

    checkUnverified(instance, doc._id)
    instance.dispose()
  })

  it('edits existing documents', async () => {
    interface Book extends SanityDocument {
      _type: 'book'
      title: string
    }

    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    const doc: DocumentHandle<Book> = {_id: 'existing-doc', _type: 'book'}
    const state = getDocumentState(instance, doc)

    // not subscribed yet so the value is undefined
    expect(state.getCurrent()).toBeUndefined()

    const unsubscribe = state.subscribe()

    // wait for it to populate
    await firstValueFrom(state.observable.pipe(first((i) => !!i)))

    expect(state.getCurrent()).toMatchObject({
      _id: getDraftId(doc._id),
      title: 'existing doc',
    })

    await applyActions(instance, editDocument(doc, {set: {title: 'updated title'}}))
    expect(state.getCurrent()).toMatchObject({
      _id: getDraftId(doc._id),
      title: 'updated title',
    })

    checkUnverified(instance, doc._id)
    unsubscribe()
    instance.dispose()
  })

  it('sets optimistic changes synchronously', async () => {
    const instance1 = createSanityInstance({projectId: 'p', dataset: 'd'})
    const instance2 = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Article extends SanityDocument {
      title?: string
      _type: 'article'
    }

    const doc: DocumentHandle<Article> = {_id: 'optimistic', _type: 'article'}

    const state1 = getDocumentState(instance1, doc)
    const state2 = getDocumentState(instance2, doc)

    const unsubscribe1 = state1.subscribe()
    const unsubscribe2 = state2.subscribe()

    // wait one frame so the value is primed in the store
    await firstValueFrom(state1.observable.pipe(first((i) => i !== undefined)))

    // then the actions are synchronous
    expect(state1.getCurrent()).toBeNull()
    applyActions(instance1, createDocument(doc))
    expect(state1.getCurrent()).toMatchObject({_id: getDraftId(doc._id)})
    const actionResult1Promise = applyActions(
      instance1,
      editDocument(doc, {set: {title: 'initial title'}}),
    )
    expect(state1.getCurrent()?.title).toBe('initial title')

    // notice how state2 doesn't have the value yet because it's a difference
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
    const actionResult2Promise = applyActions(
      instance2,
      editDocument(doc, {set: {title: 'updated title'}}),
    )
    expect(state2.getCurrent()?.title).toBe('updated title')
    // async for state 1
    expect(state1.getCurrent()?.title).toBe('initial title')

    const actionResult2 = await actionResult2Promise
    await actionResult2.submitted()
    expect(state1.getCurrent()?.title).toBe('updated title')

    checkUnverified(instance1, doc._id)
    checkUnverified(instance2, doc._id)
    unsubscribe1()
    unsubscribe2()
    instance1.dispose()
    instance2.dispose()
  })

  it('propagates changes between two instances', async () => {
    const instance1 = createSanityInstance({projectId: 'p', dataset: 'd'})
    const instance2 = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Blog extends SanityDocument {
      _type: 'blog'
      content?: string
    }
    const doc: DocumentHandle<Blog> = {_id: 'doc-collab', _type: 'blog'}
    const state1 = getDocumentState(instance1, doc)
    const state2 = getDocumentState(instance2, doc)

    const state1Unsubscribe = state1.subscribe()
    const state2Unsubscribe = state2.subscribe()

    // Create the document from instance1.
    await applyActions(instance1, createDocument(doc)).then((r) => r.submitted())

    const doc1 = state1.getCurrent()
    const doc2 = state2.getCurrent()
    expect(doc1?._id).toEqual(getDraftId(doc._id))
    expect(doc2?._id).toEqual(getDraftId(doc._id))

    // Now, edit the document from instance2.
    await applyActions(instance2, editDocument(doc, {set: {content: 'Hello world!'}})).then((r) =>
      r.submitted(),
    )

    const updated1 = state1.getCurrent()
    const updated2 = state2.getCurrent()
    expect(updated1?.content).toEqual('Hello world!')
    expect(updated2?.content).toEqual('Hello world!')

    state1Unsubscribe()
    state2Unsubscribe()

    checkUnverified(instance1, doc._id)
    checkUnverified(instance2, doc._id)

    instance1.dispose()
    instance2.dispose()
  })

  it('handles concurrent edits and resolves conflicts', async () => {
    const instance1 = createSanityInstance({projectId: 'p', dataset: 'd'})
    const instance2 = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Note extends SanityDocument {
      _type: 'note'
      text?: string
    }

    const doc: DocumentHandle<Note> = {_id: 'doc-concurrent', _type: 'note'}
    const state1 = getDocumentState(instance1, doc)
    const state2 = getDocumentState(instance2, doc)

    const state1Unsubscribe = state1.subscribe()
    const state2Unsubscribe = state2.subscribe()

    // Create the initial document from a one-off instance.
    await applyActions(createSanityInstance({projectId: 'p', dataset: 'd'}), [
      createDocument(doc),
      editDocument(doc, {set: {text: 'The quick brown fox jumps over the lazy dog'}}),
    ]).then((res) => res.submitted())

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Both instances now issue an edit simultaneously.
    const p1 = applyActions(
      instance1,
      editDocument(doc, {set: {text: 'The quick brown fox jumps over the lazy cat'}}),
    ).then((r) => r.submitted())
    const p2 = applyActions(
      instance2,
      editDocument(doc, {set: {text: 'The quick brown elephant jumps over the lazy dog'}}),
    ).then((r) => r.submitted())

    // Wait for both actions to complete (or reject).
    await Promise.allSettled([p1, p2])

    const finalDoc1 = state1.getCurrent()
    const finalDoc2 = state2.getCurrent()
    expect(finalDoc1?.text).toEqual(finalDoc2?.text)
    expect(finalDoc1?.text).toBe('The quick brown elephant jumps over the lazy cat')

    checkUnverified(instance1, doc._id)
    checkUnverified(instance2, doc._id)

    state1Unsubscribe()
    state2Unsubscribe()

    instance1.dispose()
    instance2.dispose()
  })

  it('unpublishes and discards a document', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Post extends SanityDocument {
      _type: 'post'
    }

    const doc: DocumentHandle<Post> = {_id: 'doc-pub-unpub', _type: 'post'}
    const documentState = getDocumentState(instance, doc)
    const unsubscribe = documentState.subscribe()

    // Create and publish the document.
    await applyActions(instance, createDocument(doc))
    const afterPublish = await applyActions(instance, publishDocument(doc))
    const publishedDoc = documentState.getCurrent()
    expect(publishedDoc).toMatchObject({
      _id: getPublishedId(doc._id),
      _rev: afterPublish.transactionId,
    })

    // Unpublish the document (which should delete the published version and create a draft).
    await applyActions(instance, unpublishDocument(doc))
    const afterUnpublish = documentState.getCurrent()
    // In our mock implementation the _id remains the same but the published copy is removed.
    expect(afterUnpublish?._id).toEqual(getDraftId(doc._id))

    // Discard the draft (which deletes the draft version).
    await applyActions(instance, discardDocument(doc))
    const afterDiscard = documentState.getCurrent()
    expect(afterDiscard).toBeNull()

    checkUnverified(instance, doc._id)
    unsubscribe()

    instance.dispose()
  })

  it('deletes a document', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Task extends SanityDocument {
      _type: 'task'
    }

    const doc: DocumentHandle<Task> = {_id: 'doc-delete', _type: 'task'}

    const documentState = getDocumentState(instance, doc)
    const unsubscribe = documentState.subscribe()

    await applyActions(instance, createDocument(doc))
    const docValue = documentState.getCurrent()
    expect(docValue).toBeDefined()

    // Delete the document.
    await applyActions(instance, deleteDocument(doc))
    const afterDelete = documentState.getCurrent()
    expect(afterDelete).toBeNull()

    checkUnverified(instance, doc._id)
    unsubscribe()

    instance.dispose()
  })

  it('cleans up document state when there are no subscribers', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Event extends SanityDocument {
      _type: 'event'
    }

    const doc: DocumentHandle<Event> = {_id: 'doc-cleanup', _type: 'event'}
    const documentState = getDocumentState(instance, doc)

    // Subscribe to the document state.
    const unsubscribe = documentState.subscribe()

    // Create a document.
    await applyActions(instance, createDocument(doc))
    expect(documentState.getCurrent()).toBeDefined()

    // Unsubscribe from the document.
    checkUnverified(instance, doc._id)
    unsubscribe()

    // Wait longer than DOCUMENT_STATE_CLEAR_DELAY (set to 1000ms normally; our mocks set it to 100)
    await new Promise((resolve) => setTimeout(resolve, 110))

    // When a new subscriber is created, if the state was cleared it should return undefined.
    const newDocumentState = getDocumentState(instance, doc)
    expect(newDocumentState.getCurrent()).toBeUndefined()
    instance.dispose()
  })

  it('fetches documents if there are no active subscriptions for the actions applied', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Book extends SanityDocument {
      _type: 'book'
      title?: string
    }
    const doc: DocumentHandle<Book> = {_id: 'existing-doc', _type: 'book'}

    const {getCurrent} = getDocumentState(instance, doc)
    expect(getCurrent()).toBeUndefined()

    // there are no active subscriptions so applying this action will create one
    // for this action. this subscription will be removed when the outgoing
    // transaction for this action has been accepted by the server
    const setNewTitle = applyActions(instance, editDocument(doc, {set: {title: 'new title'}}))
    expect(getCurrent()?.title).toBeUndefined()

    await setNewTitle
    expect(getCurrent()?.title).toBe('new title')

    // there is an active subscriber now so the edits are synchronous
    applyActions(instance, editDocument(doc, {set: {title: 'updated title'}}))
    expect(getCurrent()?.title).toBe('updated title')
    applyActions(instance, editDocument(doc, {set: {title: 'updated title!'}}))
    expect(getCurrent()?.title).toBe('updated title!')

    // await submitted in order to test that there is no subscriptions
    const result = await applyActions(instance, editDocument(doc, {set: {title: 'updated title'}}))
    await result.submitted()

    // test that there isn't any document state
    const {documentStates} = getOrCreateResource(instance, documentStore).state.get()
    expect(documentStates).toEqual({})

    const setNewNewTitle = applyActions(
      instance,
      editDocument(doc, {set: {title: 'new new title'}}),
    )
    // now we'll have to await again
    expect(getCurrent()?.title).toBe(undefined)

    await setNewNewTitle
    expect(getCurrent()?.title).toBe('new new title')
    instance.dispose()
  })

  it('batches edit transaction into one outgoing transaction', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Author extends SanityDocument {
      _type: 'author'
      name?: string
    }
    const doc: DocumentHandle<Author> = {_id: crypto.randomUUID(), _type: 'author'}

    const unsubscribe = getDocumentState(instance, doc).subscribe()

    // this creates its own transaction
    applyActions(instance, createDocument(doc))

    // these get batched into one
    applyActions(instance, editDocument(doc, {set: {name: 'name!'}}))
    applyActions(instance, editDocument(doc, {set: {name: 'name!!'}}))
    applyActions(instance, editDocument(doc, {set: {name: 'name!!!'}}))
    const res = await applyActions(instance, editDocument(doc, {set: {name: 'name!!!!'}}))
    await res.submitted()

    expect(client.action).toHaveBeenCalledTimes(2)
    const [, [_actions]] = vi.mocked(client.action).mock.calls
    const actions = Array.isArray(_actions) ? _actions : [_actions]
    expect(actions.length > 0).toBe(true)
    expect(actions.every(({actionType}) => actionType === 'sanity.action.document.edit')).toBe(true)

    unsubscribe()
    checkUnverified(instance, doc._id)

    instance.dispose()
  })

  it('reverts failed outgoing transaction locally', async () => {
    const clientActionMockImplementation = vi.mocked(client.action).getMockImplementation()!
    vi.mocked(client.action).mockImplementation(async (...args) => {
      const [, {transactionId} = {}] = args
      if (transactionId === 'force-revert') throw new Error('example error')
      return await clientActionMockImplementation(...args)
    })

    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    const revertedEventPromise = new Promise<TransactionRevertedEvent>((resolve) => {
      const unsubscribe = subscribeDocumentEvents(instance, (e) => {
        if (e.type === 'reverted') {
          resolve(e)
          unsubscribe()
        }
      })
    })

    interface Author extends SanityDocument {
      _type: 'author'
      name?: string
    }
    const doc: DocumentHandle<Author> = {_id: crypto.randomUUID(), _type: 'author'}

    const {getCurrent, subscribe} = getDocumentState(instance, doc)
    const unsubscribe = subscribe()

    await applyActions(instance, createDocument(doc))
    applyActions(instance, editDocument(doc, {set: {name: 'the'}}))
    applyActions(instance, editDocument(doc, {set: {name: 'the quick'}}))

    // this edit action is simulated to fail from the backend and will be reverted
    const revertedActionResult = applyActions(
      instance,
      editDocument(doc, {set: {name: 'the quick brown'}}),
      {
        transactionId: 'force-revert',
        disableBatching: true,
      },
    )

    applyActions(instance, editDocument(doc, {set: {name: 'the quick brown fox'}}))
    await applyActions(
      instance,
      editDocument(doc, {set: {name: 'the quick brown fox jumps'}}),
    ).then((e) => e.submitted())

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
    expect(getCurrent()?.name).toBe('the quick fox jumps')

    // check that we can still edit after recovering from the rror
    applyActions(instance, editDocument(doc, {set: {name: 'TEST the quick fox jumps'}}))
    expect(getCurrent()?.name).toBe('TEST the quick fox jumps')

    checkUnverified(instance, doc._id)
    unsubscribe()
    vi.mocked(client.action).mockImplementation(clientActionMockImplementation)
  })

  it('removes a queued transaction if it fails to apply', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    const actionErrorEventPromise = new Promise<ActionErrorEvent>((resolve) => {
      const unsubscribe = subscribeDocumentEvents(instance, (e) => {
        if (e.type === 'error') {
          resolve(e)
          unsubscribe()
        }
      })
    })

    interface Author extends SanityDocument {
      _type: 'author'
      name?: string
    }

    const doc: DocumentHandle<Author> = {_id: crypto.randomUUID(), _type: 'author'}
    const state = getDocumentState(instance, doc)
    const unsubscribe = state.subscribe()

    await expect(
      applyActions(instance, editDocument(doc, {set: {name: "can't set"}})),
    ).rejects.toThrowError(/Cannot edit document/)

    await expect(actionErrorEventPromise).resolves.toMatchObject({
      documentId: doc._id,
      type: 'error',
      message: expect.stringContaining('Cannot edit document'),
    })

    // editing should still work after though (no crashing)
    await applyActions(instance, createDocument(doc))
    applyActions(instance, editDocument(doc, {set: {name: 'can set!'}}))

    expect(state.getCurrent()?.name).toBe('can set!')

    unsubscribe()
  })
})

describe('resolveDocument', () => {
  it('returns a promise that resolves when a document has been loaded in the store (useful for suspense)', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    interface Book extends SanityDocument {
      _type: 'book'
      title?: string
    }
    const doc: DocumentHandle<Book> = {_id: crypto.randomUUID(), _type: 'book'}

    expect(await resolveDocument<Book>(instance, doc)).toBe(null)

    // use one-off instance to create the document in the mock backend
    const result = await applyActions(createSanityInstance({projectId: 'p', dataset: 'd'}), [
      createDocument(doc),
      editDocument(doc, {set: {title: 'initial title'}}),
    ])
    await result.submitted() // wait till submitted to server before resolving

    await expect(resolveDocument<Book>(instance, doc)).resolves.toMatchObject({
      _id: getDraftId(doc._id),
      _type: 'book',
      title: 'initial title',
    })
  })
})

describe('document events', () => {
  it('emits an event for each action after an outgoing transaction has been accepted', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    const handler = vi.fn()
    const unsubscribe = subscribeDocumentEvents(instance, handler)

    interface Author extends SanityDocument {
      _type: 'author'
      name?: string
    }
    const doc: DocumentHandle<Author> = {_id: crypto.randomUUID(), _type: 'author'}
    expect(handler).toHaveBeenCalledTimes(0)

    const tnx1 = await applyActions(instance, [
      createDocument(doc),
      editDocument(doc, {set: {name: 'new name'}}),
      publishDocument(doc),
    ]).then((e) => e.submitted())
    expect(handler).toHaveBeenCalledTimes(4)

    const tnx2 = await applyActions(instance, [
      unpublishDocument(doc),
      publishDocument(doc),
      editDocument(doc, {set: {name: 'updated name'}}),
      discardDocument(doc),
    ]).then((e) => e.submitted())
    expect(handler).toHaveBeenCalledTimes(9)

    expect(handler.mock.calls).toMatchObject([
      [{documentId: doc._id, type: 'created', outgoing: {transactionId: tnx1.transactionId}}],
      [{documentId: doc._id, type: 'edited', outgoing: {transactionId: tnx1.transactionId}}],
      [{documentId: doc._id, type: 'published', outgoing: {transactionId: tnx1.transactionId}}],
      [{type: 'accepted', outgoing: {transactionId: tnx1.transactionId}}],
      [{documentId: doc._id, type: 'unpublished', outgoing: {transactionId: tnx2.transactionId}}],
      [{documentId: doc._id, type: 'published', outgoing: {transactionId: tnx2.transactionId}}],
      [{documentId: doc._id, type: 'edited', outgoing: {transactionId: tnx2.transactionId}}],
      [{documentId: doc._id, type: 'discarded', outgoing: {transactionId: tnx2.transactionId}}],
      [{type: 'accepted', outgoing: {transactionId: tnx2.transactionId}}],
    ])

    await applyActions(instance, deleteDocument(doc))

    unsubscribe()
  })
})
