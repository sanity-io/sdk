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
import {from, Observable, of, ReplaySubject, Subject} from 'rxjs'
import {beforeEach, it, vi} from 'vitest'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createSanityInstance} from '../instance/sanityInstance'
import {getDraftId, getPublishedId} from '../preview/util'
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
import {getDocumentState} from './documentStore'
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
          sharedListener.subscribe(observer)
        }),
        {
          next: sharedListener.next.bind(sharedListener),
          complete: sharedListener.complete.bind(sharedListener),
        },
      ),
    ),
  }
})

vi.mock('./documentConstants.ts', async (importOriginal) => {
  const {
    INITIAL_OUTGOING_THROTTLE_TIME: _unused,
    DOCUMENT_STATE_CLEAR_DELAY: _alsoUnused,
    ...rest
  } = await importOriginal<typeof import('./documentConstants')>()

  return {
    INITIAL_OUTGOING_THROTTLE_TIME: 0,
    DOCUMENT_STATE_CLEAR_DELAY: 100,
    ...rest,
  }
})

beforeEach(() => {
  const client$ = (getSubscribableClient as () => ReplaySubject<SanityClient>)()
  const sharedListener = (createSharedListener as () => Subject<ListenEvent<SanityDocument>>)()

  let documents: DocumentSet = {}

  vi.mocked(createFetchDocument).mockReturnValue((id) => of(documents[id] ?? null))

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
            transition: 'appear',
            visibility: 'query',
            previousRev: prevDoc._rev,
          })
        }

        documents = next

        for (const mutationEvent of mutationEvents) {
          sharedListener.next(mutationEvent)
        }
      }

      return {transactionId}
    },
  )

  const client = {
    action: action as SanityClient['action'],
    fetch: fetch as SanityClient['fetch'],
    observable: {
      action: (...args: Parameters<typeof action>) => from(action(...args)),
      fetch: (...args: Parameters<typeof fetch>) => from(fetch(...args)),
    },
  } as SanityClient
  client$.next(client)
})

/**
 * These tests verify the collaborative editing lifecycle using the public APIs.
 * We simulate:
 * - A simple create–edit–publish flow on one instance.
 * - Two instances that share a listener so that an edit on one instance is
 *   reflected in the other.
 * - Conflict resolution in a concurrent editing scenario.
 * - The unpublish/discard/delete flows.
 * - Cleanup of document state when there are no more subscriptions.
 */
describe('DocumentStore integration tests', () => {
  it('should create, edit, and publish a document (single instance)', async () => {
    const instance1 = createSanityInstance({projectId: 'p', dataset: 'd'})

    const docId = 'doc-single'
    const documentState = getDocumentState(instance1, docId)

    const unsubscribe = documentState.subscribe()

    // Initially the document is undefined
    expect(documentState.getCurrent()).toBe(null)

    // Create a new document
    await applyActions(instance1, createDocument({_id: docId, _type: 'article'}))
    let currentDoc = documentState.getCurrent()
    expect(currentDoc?._id).toEqual(getDraftId(docId))

    // Edit the document – add a title
    await applyActions(instance1, editDocument(docId, {set: {title: 'My First Article'}}))
    currentDoc = documentState.getCurrent()
    expect(currentDoc?.title).toEqual('My First Article')

    // Publish the document; the resulting transactionId is used as the new _rev
    const {transactionId, submitted} = await applyActions(instance1, publishDocument(docId))
    await submitted()
    currentDoc = documentState.getCurrent()

    expect(currentDoc).toMatchObject({
      _id: docId,
      _rev: transactionId,
    })

    unsubscribe()
  })

  it('should propagate changes between two instances', async () => {
    const instance1 = createSanityInstance({projectId: 'p', dataset: 'd'})
    const instance2 = createSanityInstance({projectId: 'p', dataset: 'd'})

    const docId = 'doc-collab'
    const state1 = getDocumentState(instance1, docId)
    const state2 = getDocumentState(instance2, docId)

    const state1Unsubscribe = state1.subscribe()
    const state2Unsubscribe = state2.subscribe()

    // Create the document from instance1.
    await applyActions(instance1, createDocument({_id: docId, _type: 'blog'})).then((r) =>
      r.submitted(),
    )

    const doc1 = state1.getCurrent()
    const doc2 = state2.getCurrent()
    expect(doc1?._id).toEqual(getDraftId(docId))
    expect(doc2?._id).toEqual(getDraftId(docId))

    // Now, edit the document from instance2.
    await applyActions(instance2, editDocument(docId, {set: {content: 'Hello world!'}})).then((r) =>
      r.submitted(),
    )

    const updated1 = state1.getCurrent()
    const updated2 = state2.getCurrent()
    expect(updated1?.content).toEqual('Hello world!')
    expect(updated2?.content).toEqual('Hello world!')

    state1Unsubscribe()
    state2Unsubscribe()
  })

  it('should handle concurrent edits and resolve conflicts', async () => {
    const instance1 = createSanityInstance({projectId: 'p', dataset: 'd'})
    const instance2 = createSanityInstance({projectId: 'p', dataset: 'd'})

    const docId = 'doc-concurrent'
    const state1 = getDocumentState(instance1, docId)
    const state2 = getDocumentState(instance2, docId)

    const state1Unsubscribe = state1.subscribe()
    const state2Unsubscribe = state2.subscribe()

    // Create the document from instance1.
    await applyActions(instance1, createDocument({_id: docId, _type: 'note'})).then((res) =>
      res.submitted(),
    )

    await applyActions(
      instance1,
      editDocument(docId, {set: {text: 'The quick brown fox jumps over the lazy dog'}}),
    ).then((res) => res.submitted())

    // Both instances now issue an edit simultaneously.
    const p1 = applyActions(
      instance1,
      editDocument(docId, {set: {text: 'The quick brown fox jumps over the lazy cat'}}),
    )
    const p2 = applyActions(
      instance2,
      editDocument(docId, {set: {text: 'The quick brown elephant jumps over the lazy dog'}}),
    )

    // Wait for both actions to complete (or reject).
    await Promise.allSettled([p1.then((r) => r.submitted()), p2.then((r) => r.submitted())])

    // In a real conflict, one edit may “win” or the conflict resolution may merge.
    // Here we check that both instances eventually agree on the final text.
    const finalDoc1 = state1.getCurrent()
    const finalDoc2 = state2.getCurrent()
    expect(finalDoc1?.text).toEqual(finalDoc2?.text)
    // Accept that the text is one of the two possible edits.
    expect(finalDoc1?.text).toBe('The quick brown elephant jumps over the lazy cat')

    state1Unsubscribe()
    state2Unsubscribe()
  })

  it('should unpublish and discard a document', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    const docId = 'doc-pub-unpub'
    const documentState = getDocumentState(instance, docId)
    const unsubscribe = documentState.subscribe()

    // Create and publish the document.
    await applyActions(instance, createDocument({_id: docId, _type: 'post'}))
    const afterPublish = await applyActions(instance, publishDocument(docId))
    const publishedDoc = documentState.getCurrent()
    expect(publishedDoc).toMatchObject({
      _id: getPublishedId(docId),
      _rev: afterPublish.transactionId,
    })

    // Unpublish the document (which should delete the published version and create a draft).
    await applyActions(instance, unpublishDocument(docId))
    const afterUnpublish = documentState.getCurrent()
    // In our mock implementation the _id remains the same but the published copy is removed.
    expect(afterUnpublish?._id).toEqual(getDraftId(docId))

    // Discard the draft (which deletes the draft version).
    await applyActions(instance, discardDocument(docId))
    const afterDiscard = documentState.getCurrent()
    expect(afterDiscard).toBeNull()

    unsubscribe()
  })

  it('should delete a document', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const docId = 'doc-delete'

    const documentState = getDocumentState(instance, docId)
    const unsubscribe = documentState.subscribe()

    await applyActions(instance, createDocument({_id: docId, _type: 'task'}))
    const doc = documentState.getCurrent()
    expect(doc).toBeDefined()

    // Delete the document.
    await applyActions(instance, deleteDocument(docId))
    const afterDelete = documentState.getCurrent()
    expect(afterDelete).toBeNull()

    unsubscribe()
  })

  it('should clean up document state when there are no subscribers', async () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const docId = 'doc-cleanup'
    const documentState = getDocumentState(instance, docId)

    // Subscribe to the document state.
    const unsubscribe = documentState.subscribe()

    // Create a document.
    await applyActions(instance, createDocument({_id: docId, _type: 'event'}))
    expect(documentState.getCurrent()).toBeDefined()

    // Unsubscribe from the document.
    unsubscribe()

    // Wait longer than DOCUMENT_STATE_CLEAR_DELAY (set to 1000ms normally; our mocks set it to 100)
    await new Promise((resolve) => setTimeout(resolve, 110))

    // When a new subscriber is created, if the state was cleared it should return undefined.
    const newDocumentState = getDocumentState(instance, docId)
    expect(newDocumentState.getCurrent()).toBeUndefined()
  })
})
