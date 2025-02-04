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
import {buffer, firstValueFrom, from, Observable, of, ReplaySubject, Subject} from 'rxjs'
import {beforeEach, it, vi} from 'vitest'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createSanityInstance} from '../instance/sanityInstance'
import {type SanityInstance} from '../instance/types'
import {type StateSource} from '../resources/createStateSourceAction'
import {createDocument, editDocument, publishDocument} from './actions'
import {applyActions} from './applyActions'
import {applyMutations, type DocumentSet} from './applyMutations'
import {diffPatch} from './diffPatch'
import {getDocumentState, type HttpAction} from './documentStore'
import {createFetchDocument, createSharedListener} from './sharedListener'

let instance: SanityInstance

beforeEach(() => {
  // vi.useFakeTimers()
  // setTimeout(async () => {
  //   while (true) {
  //     await vi.advanceTimersToNextTimerAsync()
  //   }
  // }, 0)
  // vi.advanceTimersToNextTimer()

  instance = createSanityInstance({projectId: 'p', dataset: 'd'})

  const client$ = vi.mocked<() => ReplaySubject<SanityClient>>(
    getSubscribableClient as () => ReplaySubject<SanityClient>,
  )()
  const sharedListener = vi.mocked<() => Subject<ListenEvent<SanityDocument>>>(
    createSharedListener as () => Subject<ListenEvent<SanityDocument>>,
  )()

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

            next = applyMutations({
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

            next = applyMutations({
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

            next = applyMutations({
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

            next = applyMutations({
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

            next = applyMutations({
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

            next = applyMutations({
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

function promiseWithResolvers<T = void>() {
  let resolve!: (t: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return {resolve, reject, promise}
}

it('works', async () => {
  const documentState = getDocumentState(instance, 'foo') as StateSource<
    SanityDocument | null | undefined
  >

  const done = promiseWithResolvers()
  const states = firstValueFrom(documentState.observable.pipe(buffer(from(done.promise))))

  await applyActions(instance, [createDocument({_type: 'author', _id: 'foo'})])
  await applyActions(instance, [editDocument('foo', {set: {name: 'updated again!'}})])
  await applyActions(instance, editDocument('foo', {set: {name: 'updated again!!'}}))
  const result = await applyActions(instance, publishDocument('foo'))
  await result.submitted()
  done.resolve()

  // eslint-disable-next-line no-console
  console.log(await states)
})
