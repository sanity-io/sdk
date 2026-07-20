/**
 * Two-client concurrency rig for the document store.
 *
 * Two real store instances (separate optimistic pipelines, like two machines)
 * are connected to a mock Content Lake that:
 *
 * - holds submitted transactions until the test releases them, so both clients
 *   compute their edits against the same base revision (true concurrency)
 * - applies released transactions with `processMutations` (the SDK's own
 *   content-lake-faithful applier) against the current server state
 * - emits listener mutation events carrying the actual submitted mutations
 *   with `transactionId`/`previousRev`/`resultRev`, to every connected client
 *
 * Every scenario runs twice: once with client A's transaction applied first
 * and once with client B's first. After both transactions settle, both
 * clients must converge to the server's state. Scenario-specific assertions
 * then check for data loss (marker survival). Outcomes that are lossy with
 * the current snapshot-diff rebase are documented in `KNOWN_LOSS` so later
 * phases (DMP squashing, operational rebase) can flip them deliberately.
 */
import {
  type BaseActionOptions,
  type ListenEvent,
  type MutationEvent,
  type SanityClient,
  type WelcomeEvent,
} from '@sanity/client'
import {DocumentId, getDraftId, getPublishedId} from '@sanity/id-utils'
import {type Mutation, type PatchOperations, type SanityDocument} from '@sanity/types'
import {
  defer,
  delay,
  first,
  firstValueFrom,
  from,
  Observable,
  of,
  ReplaySubject,
  Subject,
} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {editDocument, publishDocument} from './actions'
import {applyDocumentActions} from './applyDocumentActions'
import {getDocumentState, getDocumentSyncStatus} from './documentStore'
import {type DatasetAcl} from './permissions'
import {type DocumentSet, getDocumentIds, processMutations} from './processMutations'
import {type HttpAction} from './reducers'
import {createFetchDocument, createSharedListener} from './sharedListener'

vi.mock('../client/clientStore.ts', () => ({
  getClientState: vi.fn().mockReturnValue({observable: new ReplaySubject(1)}),
}))

vi.mock('./sharedListener.ts', () => ({
  createSharedListener: vi.fn(),
  createFetchDocument: vi.fn(),
}))

vi.mock('./documentConstants.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./documentConstants')>()
  return {
    ...original,
    INITIAL_OUTGOING_THROTTLE_TIME: 0,
    DOCUMENT_STATE_CLEAR_DELAY: 25,
    OUT_OF_SYNC_RETRY_BASE_DELAY: 0,
    OUT_OF_SYNC_RETRY_MAX_DELAY: 0,
  }
})

interface Span {
  _key: string
  _type: 'span'
  text: string
  marks: string[]
}

interface Block {
  _key: string
  _type: 'block'
  style: 'normal'
  children: Span[]
  markDefs: {_key: string; _type: string; href?: string}[]
}

interface RigDocument extends SanityDocument {
  title?: string
  subtitle?: string
  count?: number
  content?: Block[]
}

interface HeldSubmission {
  transactionId: string
  actions: HttpAction[]
  resolve: (result: {transactionId: string}) => void
}

interface MockContentLake {
  connect: () => {events: Observable<ListenEvent<SanityDocument>>; dispose: () => void}
  getDocument: (id: string) => SanityDocument | null
  seed: (docs: DocumentSet) => void
  holdSubmissions: () => void
  submitActions: (actions: HttpAction[], transactionId: string) => Promise<{transactionId: string}>
  release: (transactionId: string) => Promise<void>
  pendingTransactionIds: () => string[]
}

function createMockContentLake(): MockContentLake {
  let documents: DocumentSet = {}
  const connections: Subject<ListenEvent<SanityDocument>>[] = []
  let holding = false
  const held: HeldSubmission[] = []

  function convertAction(action: HttpAction, current: DocumentSet): Mutation[] {
    switch (action.actionType) {
      case 'sanity.action.document.edit': {
        const source = (action.draftId && current[action.draftId]) ?? current[action.publishedId]
        if (!source) {
          throw new Error(
            `Mock backend: no document found for edit (draftId: ${action.draftId}, publishedId: ${action.publishedId})`,
          )
        }
        return [
          {createIfNotExists: {...source, _id: action.draftId}},
          {patch: {id: action.draftId, ...action.patch}},
        ]
      }
      case 'sanity.action.document.publish': {
        const draft = current[action.draftId]
        if (!draft) {
          throw new Error(`Mock backend: cannot publish, draft ${action.draftId} not found`)
        }
        // NOTE: the real Actions API enforces the optimistic lock
        // (`ifDraftRevisionId`); this mock intentionally ignores it so the
        // matrix can observe client-side conflict behavior in isolation
        return [
          {delete: {id: action.draftId}},
          {createOrReplace: {...draft, _id: action.publishedId}},
        ]
      }
      default:
        throw new Error(`Mock backend: unsupported action type ${action.actionType}`)
    }
  }

  function mutationTargets(mutation: Mutation): string[] {
    if ('patch' in mutation) return getDocumentIds(mutation.patch)
    if ('delete' in mutation) return getDocumentIds(mutation.delete)
    if ('create' in mutation && mutation.create._id) return [mutation.create._id]
    if ('createOrReplace' in mutation) return [mutation.createOrReplace._id]
    if ('createIfNotExists' in mutation) return [mutation.createIfNotExists._id]
    return []
  }

  async function apply(submission: HeldSubmission): Promise<void> {
    const {transactionId, actions} = submission
    const timestamp = new Date().toISOString()
    const prior = {...documents}
    let next = {...documents}
    const allMutations: Mutation[] = []

    for (const action of actions) {
      const mutations = convertAction(action, next)
      next = processMutations({documents: next, mutations, transactionId, timestamp})
      allMutations.push(...mutations)
    }

    documents = next

    const touchedIds = Array.from(new Set(allMutations.flatMap(mutationTargets)))
    const events: MutationEvent[] = []
    let transactionCurrentEvent = 0

    for (const id of touchedIds) {
      const before = prior[id]
      const after = next[id]
      if (!before && !after) continue
      transactionCurrentEvent++
      const mutationsForDoc = allMutations.filter((m) => mutationTargets(m).includes(id))
      events.push({
        type: 'mutation',
        documentId: id,
        eventId: `${transactionId}#${id}`,
        identity: 'remote-user',
        mutations: mutationsForDoc,
        timestamp,
        transactionId,
        transactionCurrentEvent,
        transactionTotalEvents: 0, // patched below once we know the count
        transition: before && after ? 'update' : after ? 'appear' : 'disappear',
        visibility: 'query',
        ...(before && {previousRev: before._rev}),
        ...(after && {resultRev: transactionId}),
      })
    }
    for (const event of events) event.transactionTotalEvents = events.length

    // let the store's submission bookkeeping settle before the echo arrives
    await new Promise((resolve) => setTimeout(resolve, 0))

    for (const event of events) {
      for (const connection of connections) connection.next(event)
    }

    // ack after the listener echo, mirroring async visibility
    await new Promise((resolve) => setTimeout(resolve, 0))
    submission.resolve({transactionId})
  }

  return {
    connect() {
      const subject = new Subject<ListenEvent<SanityDocument>>()
      connections.push(subject)
      const welcome: WelcomeEvent = {
        type: 'welcome',
        listenerName: `mock-listener-${connections.length}`,
      }
      return {
        events: new Observable<ListenEvent<SanityDocument>>((observer) => {
          observer.next(welcome)
          return subject.subscribe(observer)
        }),
        dispose: () => {
          const index = connections.indexOf(subject)
          if (index !== -1) connections.splice(index, 1)
        },
      }
    },
    getDocument: (id) => documents[id] ?? null,
    seed(docs) {
      documents = {...documents, ...docs}
    },
    holdSubmissions() {
      holding = true
    },
    submitActions(actions, transactionId) {
      return new Promise<{transactionId: string}>((resolve, reject) => {
        const submission: HeldSubmission = {transactionId, actions, resolve}
        if (holding) {
          held.push(submission)
        } else {
          apply(submission).catch(reject)
        }
      })
    },
    async release(transactionId) {
      const index = held.findIndex((s) => s.transactionId === transactionId)
      if (index === -1) throw new Error(`No held submission with transaction ID ${transactionId}`)
      const [submission] = held.splice(index, 1)
      await apply(submission)
    },
    pendingTransactionIds: () => held.map((s) => s.transactionId),
  }
}

function createMockClient(server: MockContentLake): SanityClient {
  const datasetAcl: DatasetAcl = [
    {filter: 'true', permissions: ['create', 'history', 'read', 'update']},
  ]

  const action = vi.fn(async (input: HttpAction | HttpAction[], options?: BaseActionOptions) => {
    const actions = Array.isArray(input) ? input : [input]
    return server.submitActions(actions, options?.transactionId ?? crypto.randomUUID())
  })

  const request = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return datasetAcl
  })

  const fetch = vi.fn(async () => {
    throw new Error('Mock client: fetch is not supported in the concurrency rig')
  })

  return {
    action,
    request,
    fetch,
    observable: {
      action: (...args: Parameters<typeof action>) => from(action(...args)),
      request: (...args: Parameters<typeof request>) => from(request(...args)),
      fetch: (...args: Parameters<typeof fetch>) => from(fetch(...args)),
    },
  } as unknown as SanityClient
}

function span(key: string, text: string, marks: string[] = []): Span {
  return {_key: key, _type: 'span', text, marks}
}

function block(key: string, spanKey: string, text: string): Block {
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    children: [span(spanKey, text)],
    markDefs: [],
  }
}

const DOCUMENT_ID = DocumentId('rig-doc')
const DRAFT_ID = getDraftId(DOCUMENT_ID)
const PUBLISHED_ID = getPublishedId(DOCUMENT_ID)
const handle = {documentId: DOCUMENT_ID, documentType: 'article'}

const TITLE = 'The quick brown fox jumps over the lazy dog'

function seedDocument(): SanityDocument {
  return {
    _id: DRAFT_ID,
    _type: 'article',
    _rev: 'seed-rev',
    _createdAt: '2026-01-01T00:00:00.000Z',
    _updatedAt: '2026-01-01T00:00:00.000Z',
    title: TITLE,
    subtitle: 'original subtitle',
    count: 0,
    content: [
      block('blkA', 'spA', 'alpha bravo charlie delta'),
      block('blkB', 'spB', 'echo foxtrot golf hotel'),
    ],
  }
}

interface ClientContext {
  instance: SanityInstance
  resource: {projectId: string; dataset: string}
}

type Act = (client: ClientContext) => Promise<unknown>

interface CollisionResult {
  serverDraft: RigDocument | null
  serverPublished: RigDocument | null
  /** the local view (draft and published) each client settled on */
  local: {
    A: {draft: RigDocument | null; published: RigDocument | null}
    B: {draft: RigDocument | null; published: RigDocument | null}
  }
}

interface Scenario {
  id: string
  title: string
  actA: Act
  actB: Act
  /**
   * Scenario-specific assertions on the settled state. `firstWriter` is which
   * client's transaction the server applied first.
   */
  verify: (result: CollisionResult, firstWriter: 'A' | 'B') => void
}

const editField = (patches: PatchOperations, transactionId: string): Act => {
  return ({instance, resource}) =>
    applyDocumentActions(instance, {
      actions: [editDocument(handle, patches)],
      resource,
      transactionId,
    })
}

const editPreserved = (patches: PatchOperations[], transactionId: string): Act => {
  return ({instance, resource}) =>
    applyDocumentActions(instance, {
      actions: [editDocument(handle, patches, {preserveOperations: true})],
      resource,
      transactionId,
    })
}

const getSpanText = (doc: RigDocument | null, blockKey: string): string | undefined => {
  const blockNode = doc?.content?.find((b) => b._key === blockKey)
  return blockNode?.children[0]?.text
}

const getSpanMarks = (doc: RigDocument | null, blockKey: string): string[] | undefined => {
  const blockNode = doc?.content?.find((b) => b._key === blockKey)
  return blockNode?.children[0]?.marks
}

/**
 * Outcomes that are known to lose data with the current snapshot-diff
 * pipeline. Each entry documents the current (lossy) behavior; later phases
 * are expected to remove entries from this list and flip the assertions.
 * Keyed by `scenarioId` with an optional restriction on which apply order
 * exhibits the loss.
 */
const KNOWN_LOSS: {scenario: string; firstWriter?: 'A' | 'B'; reason: string}[] = [
  {
    scenario: 'preserved-set-text-vs-typing',
    reason:
      'preserveOperations forwards whole-value sets verbatim, so whichever preserved set lands second overwrites the concurrent one (server-side last-write-wins)',
  },
]

const isKnownLoss = (scenarioId: string, firstWriter: 'A' | 'B'): boolean =>
  KNOWN_LOSS.some(
    (entry) =>
      entry.scenario === scenarioId && (!entry.firstWriter || entry.firstWriter === firstWriter),
  )

/**
 * Cases where a client's local copy is known to diverge from the server after
 * everything settles. The rig asserts the divergence so the entry must be
 * removed (flipping the assertion to convergence) once a later phase fixes it.
 */
const KNOWN_DIVERGENCE: {
  scenario: string
  firstWriter: 'A' | 'B'
  client: 'A' | 'B'
  documentId: string
  reason: string
}[] = []

const isKnownDivergence = (
  scenarioId: string,
  firstWriter: 'A' | 'B',
  client: 'A' | 'B',
  documentId: string,
): boolean =>
  KNOWN_DIVERGENCE.some(
    (entry) =>
      entry.scenario === scenarioId &&
      entry.firstWriter === firstWriter &&
      entry.client === client &&
      entry.documentId === documentId,
  )

const scenarios: Scenario[] = [
  {
    id: 'string-disjoint-inserts',
    title: 'A and B insert into the same string at different offsets',
    actA: editField({set: {title: TITLE.replace('quick ', 'quick oneA ')}}, 'txn-a'),
    actB: editField({set: {title: TITLE.replace('lazy ', 'lazy twoB ')}}, 'txn-b'),
    verify: ({serverDraft}) => {
      expect(serverDraft?.title).toContain('oneA')
      expect(serverDraft?.title).toContain('twoB')
    },
  },
  {
    id: 'string-same-offset-inserts',
    title: 'A and B insert into the same string at the same offset',
    actA: editField({set: {title: TITLE.replace('quick ', 'quick oneA ')}}, 'txn-a'),
    actB: editField({set: {title: TITLE.replace('quick ', 'quick twoB ')}}, 'txn-b'),
    verify: ({serverDraft}) => {
      expect(serverDraft?.title).toContain('oneA')
      expect(serverDraft?.title).toContain('twoB')
    },
  },
  {
    id: 'string-delete-vs-insert-inside',
    title: 'A deletes a range while B inserts inside that range',
    actA: editField({set: {title: TITLE.replace('brown fox ', '')}}, 'txn-a'),
    actB: editField({set: {title: TITLE.replace('fox ', 'fox twoB ')}}, 'txn-b'),
    verify: ({serverDraft}) => {
      // deletion vs insert-inside has no universally correct answer; require
      // convergence and that the title is still a single coherent string
      expect(typeof serverDraft?.title).toBe('string')
      expect(serverDraft?.title).toContain('quick')
      expect(serverDraft?.title).toContain('lazy dog')
    },
  },
  {
    id: 'counter-inc-inc',
    title: 'A and B both increment the same counter',
    actA: editField({inc: {count: 1}}, 'txn-a'),
    actB: editField({inc: {count: 1}}, 'txn-b'),
    verify: ({serverDraft}, firstWriter) => {
      if (isKnownLoss('counter-inc-inc', firstWriter)) {
        expect(serverDraft?.count).toBe(1)
      } else {
        expect(serverDraft?.count).toBe(2)
      }
    },
  },
  {
    id: 'different-fields',
    title: 'A and B set different fields',
    actA: editField({set: {title: 'title set by A'}}, 'txn-a'),
    actB: editField({set: {subtitle: 'subtitle set by B'}}, 'txn-b'),
    verify: ({serverDraft}) => {
      expect(serverDraft?.title).toBe('title set by A')
      expect(serverDraft?.subtitle).toBe('subtitle set by B')
    },
  },
  {
    id: 'different-blocks-text',
    title: 'A and B type into different blocks of the same array',
    actA: editField(
      {set: {'content[_key=="blkA"].children[_key=="spA"].text': 'alpha oneA bravo charlie delta'}},
      'txn-a',
    ),
    actB: editField(
      {set: {'content[_key=="blkB"].children[_key=="spB"].text': 'echo foxtrot twoB golf hotel'}},
      'txn-b',
    ),
    verify: ({serverDraft}) => {
      expect(getSpanText(serverDraft, 'blkA')).toContain('oneA')
      expect(getSpanText(serverDraft, 'blkB')).toContain('twoB')
    },
  },
  {
    id: 'same-span-disjoint-offsets',
    title: 'A and B type into the same span at different offsets',
    actA: editField(
      {set: {'content[_key=="blkA"].children[_key=="spA"].text': 'alpha oneA bravo charlie delta'}},
      'txn-a',
    ),
    actB: editField(
      {set: {'content[_key=="blkA"].children[_key=="spA"].text': 'alpha bravo charlie twoB delta'}},
      'txn-b',
    ),
    verify: ({serverDraft}) => {
      const text = getSpanText(serverDraft, 'blkA')
      expect(text).toContain('oneA')
      expect(text).toContain('twoB')
    },
  },
  {
    id: 'append-block-vs-append-block',
    title: 'A and B each append a different block via whole-array set',
    actA: ({instance, resource}) => {
      const current = getDocumentState<RigDocument>(instance, handle).getCurrent()
      const content = [...(current?.content ?? []), block('blkC', 'spC', 'appended by A')]
      return applyDocumentActions(instance, {
        actions: [editDocument(handle, {set: {content}})],
        resource,
        transactionId: 'txn-a',
      })
    },
    actB: ({instance, resource}) => {
      const current = getDocumentState<RigDocument>(instance, handle).getCurrent()
      const content = [...(current?.content ?? []), block('blkD', 'spD', 'appended by B')]
      return applyDocumentActions(instance, {
        actions: [editDocument(handle, {set: {content}})],
        resource,
        transactionId: 'txn-b',
      })
    },
    verify: ({serverDraft}) => {
      const keys = serverDraft?.content?.map((b) => b._key)
      expect(keys).toContain('blkC')
      expect(keys).toContain('blkD')
    },
  },
  {
    id: 'delete-block-vs-edit-within',
    title: 'A deletes a block while B types inside it',
    actA: ({instance, resource}) => {
      const current = getDocumentState<RigDocument>(instance, handle).getCurrent()
      const content = (current?.content ?? []).filter((b) => b._key !== 'blkB')
      return applyDocumentActions(instance, {
        actions: [editDocument(handle, {set: {content}})],
        resource,
        transactionId: 'txn-a',
      })
    },
    actB: editField(
      {set: {'content[_key=="blkB"].children[_key=="spB"].text': 'echo foxtrot twoB golf hotel'}},
      'txn-b',
    ),
    verify: ({serverDraft}) => {
      // delete-vs-edit has no universally correct answer; require convergence
      // and that surviving blocks are intact
      expect(getSpanText(serverDraft, 'blkA')).toBe('alpha bravo charlie delta')
      const blkB = serverDraft?.content?.find((b) => b._key === 'blkB')
      if (blkB) {
        expect(blkB.children).toHaveLength(1)
        expect(typeof blkB.children[0].text).toBe('string')
      }
    },
  },
  {
    id: 'preserved-keyed-inserts',
    title: 'A and B insert different blocks with preserveOperations',
    actA: editPreserved(
      [{insert: {after: 'content[_key=="blkA"]', items: [block('blkC', 'spC', 'inserted by A')]}}],
      'txn-a',
    ),
    actB: editPreserved(
      [{insert: {after: 'content[_key=="blkB"]', items: [block('blkD', 'spD', 'inserted by B')]}}],
      'txn-b',
    ),
    verify: ({serverDraft}) => {
      const keys = serverDraft?.content?.map((b) => b._key)
      expect(keys).toContain('blkC')
      expect(keys).toContain('blkD')
    },
  },
  {
    id: 'preserved-set-text-vs-typing',
    title: 'A and B type into the same span via preserveOperations sets (PTE plugin path)',
    actA: editPreserved(
      [
        {
          set: {
            'content[_key=="blkA"].children[_key=="spA"].text': 'alpha oneA bravo charlie delta',
          },
        },
      ],
      'txn-a',
    ),
    actB: editPreserved(
      [
        {
          set: {
            'content[_key=="blkA"].children[_key=="spA"].text': 'alpha bravo charlie twoB delta',
          },
        },
      ],
      'txn-b',
    ),
    verify: ({serverDraft}, firstWriter) => {
      const text = getSpanText(serverDraft, 'blkA')
      const winner = firstWriter === 'A' ? 'twoB' : 'oneA'
      const loser = firstWriter === 'A' ? 'oneA' : 'twoB'
      if (isKnownLoss('preserved-set-text-vs-typing', firstWriter)) {
        // whichever set lands second overwrites the whole string
        expect(text).toContain(winner)
        expect(text).not.toContain(loser)
      } else {
        expect(text).toContain('oneA')
        expect(text).toContain('twoB')
      }
    },
  },
  {
    id: 'format-vs-typing',
    title: 'A formats a span (marks) while B types into it',
    actA: editField(
      {set: {'content[_key=="blkA"].children[_key=="spA"].marks': ['strong']}},
      'txn-a',
    ),
    actB: editField(
      {set: {'content[_key=="blkA"].children[_key=="spA"].text': 'alpha bravo twoB charlie delta'}},
      'txn-b',
    ),
    verify: ({serverDraft}) => {
      expect(getSpanMarks(serverDraft, 'blkA')).toEqual(['strong'])
      expect(getSpanText(serverDraft, 'blkA')).toContain('twoB')
    },
  },
  {
    id: 'publish-vs-edit',
    title: 'A publishes while B edits the draft',
    actA: ({instance, resource}) =>
      applyDocumentActions(instance, {
        actions: [publishDocument(handle)],
        resource,
        transactionId: 'txn-a',
      }),
    actB: editField({set: {title: `${TITLE} twoB`}}, 'txn-b'),
    verify: ({serverDraft, serverPublished}, firstWriter) => {
      if (firstWriter === 'A') {
        // publish happened against the pre-edit draft; B's edit then
        // recreated the draft (from the published copy) and applied on top
        expect(serverPublished?.title).toBe(TITLE)
        expect(serverDraft?.title).toBe(`${TITLE} twoB`)
      } else {
        // B's edit landed first, so the publish carried it along and the
        // draft was consumed by the publish
        expect(serverPublished?.title).toBe(`${TITLE} twoB`)
        expect(serverDraft).toBeNull()
      }
    },
  },
]

let server: MockContentLake
let clientA: ClientContext
let clientB: ClientContext

beforeEach(() => {
  server = createMockContentLake()

  const client$ = (getClientState as unknown as () => StateSource<SanityClient>)()
    .observable as ReplaySubject<SanityClient>
  client$.next(createMockClient(server))

  vi.mocked(createSharedListener).mockImplementation(() => server.connect())
  vi.mocked(createFetchDocument).mockImplementation(
    () => (id: string) => defer(() => of(server.getDocument(id))).pipe(delay(0)),
  )

  clientA = {
    instance: createSanityInstance({projectId: 'p', dataset: 'rig-a'}),
    resource: {projectId: 'p', dataset: 'rig-a'},
  }
  clientB = {
    instance: createSanityInstance({projectId: 'p', dataset: 'rig-b'}),
    resource: {projectId: 'p', dataset: 'rig-b'},
  }
})

afterEach(() => {
  clientA.instance.dispose()
  clientB.instance.dispose()
})

const localDoc = (client: ClientContext, id: string): RigDocument | null | undefined =>
  getDocumentState<RigDocument>(client.instance, {
    documentId: id,
    documentType: 'article',
    liveEdit: true,
  }).getCurrent() as RigDocument | null | undefined

/**
 * Drops `_updatedAt` before convergence comparison. When a client's own
 * transaction echo fast-forwards, its optimistic `local` keeps the timestamp
 * computed client-side while the server stamped its own time; the content is
 * identical. Only content convergence matters to the matrix.
 */
const withoutUpdatedAt = (doc: RigDocument | SanityDocument | null): unknown => {
  if (!doc) return doc
  const {_updatedAt, ...rest} = doc
  return rest
}

async function runCollision(
  scenario: Scenario,
  order: 'a-first' | 'b-first',
): Promise<CollisionResult> {
  server.seed({[DRAFT_ID]: seedDocument()})

  const stateA = getDocumentState<RigDocument>(clientA.instance, handle)
  const stateB = getDocumentState<RigDocument>(clientB.instance, handle)
  const unsubscribeA = stateA.subscribe()
  const unsubscribeB = stateB.subscribe()

  try {
    await firstValueFrom(stateA.observable.pipe(first((doc) => doc !== undefined)))
    await firstValueFrom(stateB.observable.pipe(first((doc) => doc !== undefined)))

    // hold submissions so both clients edit against the same base revision
    server.holdSubmissions()

    await scenario.actA(clientA)
    await scenario.actB(clientB)

    await vi.waitFor(() => {
      expect(server.pendingTransactionIds()).toHaveLength(2)
    })

    const [firstTxn, secondTxn] = order === 'a-first' ? ['txn-a', 'txn-b'] : ['txn-b', 'txn-a']
    await server.release(firstTxn)
    await server.release(secondTxn)

    const syncA = getDocumentSyncStatus(clientA.instance, handle)
    const syncB = getDocumentSyncStatus(clientB.instance, handle)

    const firstWriter = order === 'a-first' ? 'A' : 'B'
    const clients = [
      {label: 'A' as const, context: clientA},
      {label: 'B' as const, context: clientB},
    ]

    await vi.waitFor(
      () => {
        expect(syncA.getCurrent()).toBe(true)
        expect(syncB.getCurrent()).toBe(true)
        for (const id of [DRAFT_ID, PUBLISHED_ID]) {
          const serverDoc = withoutUpdatedAt(server.getDocument(id))
          for (const {label, context} of clients) {
            if (isKnownDivergence(scenario.id, firstWriter, label, id)) continue
            expect(withoutUpdatedAt(localDoc(context, id) ?? null)).toEqual(serverDoc)
          }
        }
      },
      {timeout: 3000},
    )

    // assert the documented divergences still diverge, so fixing one forces
    // its KNOWN_DIVERGENCE entry to be removed
    for (const id of [DRAFT_ID, PUBLISHED_ID]) {
      const serverDoc = withoutUpdatedAt(server.getDocument(id))
      for (const {label, context} of clients) {
        if (!isKnownDivergence(scenario.id, firstWriter, label, id)) continue
        expect(withoutUpdatedAt(localDoc(context, id) ?? null)).not.toEqual(serverDoc)
      }
    }

    return {
      serverDraft: server.getDocument(DRAFT_ID) as RigDocument | null,
      serverPublished: server.getDocument(PUBLISHED_ID) as RigDocument | null,
      local: {
        A: {
          draft: localDoc(clientA, DRAFT_ID) ?? null,
          published: localDoc(clientA, PUBLISHED_ID) ?? null,
        },
        B: {
          draft: localDoc(clientB, DRAFT_ID) ?? null,
          published: localDoc(clientB, PUBLISHED_ID) ?? null,
        },
      },
    }
  } finally {
    unsubscribeA()
    unsubscribeB()
  }
}

describe.each([
  {order: 'a-first' as const, firstWriter: 'A' as const},
  {order: 'b-first' as const, firstWriter: 'B' as const},
])('collision matrix ($order)', ({order, firstWriter}) => {
  it.each(scenarios)('$id: $title', async (scenario) => {
    const result = await runCollision(scenario, order)
    scenario.verify(result, firstWriter)
  })
})

/**
 * Rebase scenarios: client A has an in-flight transaction (txn-a1, held by
 * the server) plus a second transaction (txn-a2) still in the `applied`
 * queue when client B's foreign transaction lands. This forces
 * `applyRemoteDocument` to rebase txn-a2 over the new remote.
 *
 * These scenarios pin the rebase's 3-way-merge behavior: each pending
 * transaction is re-derived from its original captured base (isolating the
 * user's intent as diff-match-patch and keyed operations) and applied onto
 * the new remote, so B's concurrent edit must survive A's rebased
 * whole-value sets. This was the load-bearing finding that made replacing
 * the rebase engine unnecessary; if it ever regresses to a re-diff against
 * the new remote, these assertions fail.
 */
interface RebaseScenario {
  id: string
  title: string
  /** first edit from A; becomes the in-flight (held) txn-a1 */
  actA1: Act
  /** second edit from A; stays in `applied` until txn-a1 clears */
  actA2: Act
  /** concurrent edit from B (txn-b) */
  actB: Act
  verify: (result: CollisionResult, firstWriter: 'A' | 'B') => void
}

const rebaseScenarios: RebaseScenario[] = [
  {
    id: 'rebase-pending-set-stomps-remote',
    title: "A's pending whole-string set is re-applied over B's concurrent insert",
    actA1: editField({set: {title: TITLE.replace('brown ', 'oneA brown ')}}, 'txn-a1'),
    actA2: ({instance, resource}) => {
      const current = getDocumentState<RigDocument>(instance, handle).getCurrent()
      return applyDocumentActions(instance, {
        actions: [editDocument(handle, {set: {title: `${current?.title} moreA`}})],
        resource,
        transactionId: 'txn-a2',
      })
    },
    actB: editField({set: {title: TITLE.replace('lazy ', 'twoB lazy ')}}, 'txn-b'),
    verify: ({serverDraft}) => {
      expect(serverDraft?.title).toContain('oneA')
      expect(serverDraft?.title).toContain('moreA')
      // the rebase must not re-apply A's whole-title set verbatim; the 3-way
      // merge re-derives it as a string diff, which preserves B's insert
      expect(serverDraft?.title).toContain('twoB')
    },
  },
  {
    id: 'rebase-pending-span-set-stomps-remote',
    title: "A's pending span text set is re-applied over B's concurrent typing in the same span",
    actA1: editField(
      {set: {'content[_key=="blkA"].children[_key=="spA"].text': 'alpha oneA bravo charlie delta'}},
      'txn-a1',
    ),
    actA2: ({instance, resource}) => {
      const current = getDocumentState<RigDocument>(instance, handle).getCurrent()
      const text = getSpanText(current ?? null, 'blkA')
      return applyDocumentActions(instance, {
        actions: [
          editDocument(handle, {
            set: {'content[_key=="blkA"].children[_key=="spA"].text': `${text} moreA`},
          }),
        ],
        resource,
        transactionId: 'txn-a2',
      })
    },
    actB: editField(
      {set: {'content[_key=="blkA"].children[_key=="spA"].text': 'alpha bravo charlie twoB delta'}},
      'txn-b',
    ),
    verify: ({serverDraft}) => {
      const text = getSpanText(serverDraft, 'blkA')
      expect(text).toContain('oneA')
      expect(text).toContain('moreA')
      // same 3-way-merge guarantee as above, one level deeper in the tree
      expect(text).toContain('twoB')
    },
  },
  {
    id: 'rebase-different-fields',
    title: "A's pending title edit is rebased over B's concurrent subtitle edit",
    actA1: editField({set: {title: 'title A1'}}, 'txn-a1'),
    actA2: editField({set: {title: 'title A2'}}, 'txn-a2'),
    actB: editField({set: {subtitle: 'subtitle from B'}}, 'txn-b'),
    verify: ({serverDraft}) => {
      expect(serverDraft?.title).toBe('title A2')
      expect(serverDraft?.subtitle).toBe('subtitle from B')
    },
  },
  {
    id: 'rebase-preserved-keyed-inserts',
    title: "A's pending preserveOperations insert is rebased over B's concurrent keyed insert",
    actA1: editPreserved(
      [{insert: {after: 'content[_key=="blkA"]', items: [block('blkC', 'spC', 'inserted by A1')]}}],
      'txn-a1',
    ),
    actA2: editPreserved(
      [{insert: {after: 'content[_key=="blkC"]', items: [block('blkE', 'spE', 'inserted by A2')]}}],
      'txn-a2',
    ),
    actB: editPreserved(
      [{insert: {after: 'content[_key=="blkB"]', items: [block('blkD', 'spD', 'inserted by B')]}}],
      'txn-b',
    ),
    verify: ({serverDraft}) => {
      const keys = serverDraft?.content?.map((b) => b._key)
      expect(keys).toContain('blkC')
      expect(keys).toContain('blkD')
      expect(keys).toContain('blkE')
    },
  },
]

async function runRebaseCollision(
  scenario: RebaseScenario,
  order: 'a-first' | 'b-first',
): Promise<CollisionResult> {
  server.seed({[DRAFT_ID]: seedDocument()})

  const stateA = getDocumentState<RigDocument>(clientA.instance, handle)
  const stateB = getDocumentState<RigDocument>(clientB.instance, handle)
  const unsubscribeA = stateA.subscribe()
  const unsubscribeB = stateB.subscribe()

  try {
    await firstValueFrom(stateA.observable.pipe(first((doc) => doc !== undefined)))
    await firstValueFrom(stateB.observable.pipe(first((doc) => doc !== undefined)))

    server.holdSubmissions()

    await scenario.actA1(clientA)
    // wait until txn-a1 is submitted (and held) so the follow-up edit stays in
    // the applied queue instead of batching into the same outgoing transaction
    await vi.waitFor(() => {
      expect(server.pendingTransactionIds()).toContain('txn-a1')
    })
    await scenario.actA2(clientA)
    await scenario.actB(clientB)
    await vi.waitFor(() => {
      expect(server.pendingTransactionIds()).toContain('txn-b')
    })

    const [firstTxn, secondTxn] = order === 'a-first' ? ['txn-a1', 'txn-b'] : ['txn-b', 'txn-a1']
    await server.release(firstTxn)
    await server.release(secondTxn)

    // txn-a1's ack clears A's outgoing slot; txn-a2 (rebased) submits next
    await vi.waitFor(() => {
      expect(server.pendingTransactionIds()).toContain('txn-a2')
    })
    await server.release('txn-a2')

    const syncA = getDocumentSyncStatus(clientA.instance, handle)
    const syncB = getDocumentSyncStatus(clientB.instance, handle)

    await vi.waitFor(
      () => {
        expect(syncA.getCurrent()).toBe(true)
        expect(syncB.getCurrent()).toBe(true)
        for (const id of [DRAFT_ID, PUBLISHED_ID]) {
          const serverDoc = withoutUpdatedAt(server.getDocument(id))
          expect(withoutUpdatedAt(localDoc(clientA, id) ?? null)).toEqual(serverDoc)
          expect(withoutUpdatedAt(localDoc(clientB, id) ?? null)).toEqual(serverDoc)
        }
      },
      {timeout: 3000},
    )

    return {
      serverDraft: server.getDocument(DRAFT_ID) as RigDocument | null,
      serverPublished: server.getDocument(PUBLISHED_ID) as RigDocument | null,
      local: {
        A: {
          draft: localDoc(clientA, DRAFT_ID) ?? null,
          published: localDoc(clientA, PUBLISHED_ID) ?? null,
        },
        B: {
          draft: localDoc(clientB, DRAFT_ID) ?? null,
          published: localDoc(clientB, PUBLISHED_ID) ?? null,
        },
      },
    }
  } finally {
    unsubscribeA()
    unsubscribeB()
  }
}

describe.each([
  {order: 'a-first' as const, firstWriter: 'A' as const},
  {order: 'b-first' as const, firstWriter: 'B' as const},
])('rebase matrix ($order)', ({order, firstWriter}) => {
  it.each(rebaseScenarios)('$id: $title', async (scenario) => {
    const result = await runRebaseCollision(scenario, order)
    scenario.verify(result, firstWriter)
  })
})
