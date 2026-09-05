import {type QueryParams} from '@sanity/client'
import {DocumentId, getVersionId, isVersionId} from '@sanity/id-utils'
import {type Path} from '@sanity/types'
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  first,
  firstValueFrom,
  groupBy,
  map,
  mergeMap,
  NEVER,
  Observable,
  pairwise,
  race,
  startWith,
  switchMap,
  tap,
} from 'rxjs'

import {
  type DatasetHandle,
  type DocumentHandle,
  type DocumentResource,
} from '../config/sanityConfig'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from '../store/createStateSourceAction'
import {type StoreState} from '../store/createStoreState'
import {defineStore, type StoreContext} from '../store/defineStore'
import {randomId} from '../utils/ids'
import {setCleanupTimeout} from '../utils/setCleanupTimeout'
import {buildCommentThreads} from './buildCommentThreads'
import {toCommentFieldPath} from './commentFieldPath'
import {getCommentsClient, observeCommentsClient, requireOrganizationId} from './commentsClient'
import {
  buildCommentsQueryFilter,
  buildDocumentCommentsQuery,
  COMMENTS_STATE_CLEAR_DELAY,
  type CommentsScope,
} from './commentsConstants'
import {normalizeComment} from './normalizeComment'
import {type CommentsEvent, observeComments} from './observeComments'
import {
  addSubscriber,
  clearPendingTransaction,
  type CommentsStoreState,
  getCommentsKey,
  parseCommentsKey,
  receiveComment,
  recordDroppedEcho,
  removeCommentFromEntry,
  removeSubscriber,
  setComments,
  setCommentsError,
} from './reducers'
import {type Comment, type CommentStatus, type CommentThread, type StoredComment} from './types'

/**
 * Which variants of a document to read comments from.
 *
 * @beta
 */
export type CommentVariants = 'perspective' | 'drafts' | 'exact' | 'all'

/**
 * Which of a document's comments to read.
 * @beta
 */
export interface CommentsOptions extends DocumentHandle {
  /** Narrow to one field. Omit to get every comment on the document. */
  fieldPath?: string | Path
  /** Narrow to open or resolved threads. Omit for both. */
  status?: CommentStatus
  /**
   * Which variants of the document to read comments from.
   *
   * - `'perspective'` follows what you are viewing: a release shows that
   *   release's comments, anything else pools draft and published.
   * - `'drafts'` pools draft and published and ignores releases.
   * - `'exact'` matches only the precise document id passed.
   * - `'all'` returns every comment on the document.
   *
   * @defaultValue 'perspective'
   */
  variants?: CommentVariants
}

/** @beta */
export interface ResolveDocumentCommentsOptions extends CommentsOptions {
  signal?: AbortSignal
}

/**
 * An arbitrary comment query, for anything that is not "comments on this
 * document" — cross-document views, per-user views, organization-wide activity.
 *
 * @beta
 */
export interface CommentsQueryOptions extends DatasetHandle {
  /**
   * GROQ filter applied to comment documents. `_type == "sanity.comment"` is
   * added for you, so this only has to say which comments.
   */
  filter: string
  params?: QueryParams
}

/** @beta */
export interface ResolveCommentsQueryOptions extends CommentsQueryOptions {
  signal?: AbortSignal
}

/** Read options with the resource they address already resolved. */
type WithResource<T> = T & {resource: DocumentResource}

/**
 * Fields on the read option types that are deliberately left out of the keys
 * below, because none of them changes which comments an option set addresses.
 *
 * `source` is the deprecated alias for `resource` and is folded into it before
 * a key is ever built, so keying on both would give one list two keys.
 * `liveEdit` describes the document rather than its comments, which hang off
 * the published id whether or not drafts exist.
 */
type CommentsKeyIrrelevantField = 'source' | 'liveEdit'

/**
 * A stable string standing for one set of document read options.
 *
 * Only React needs this: it holds one state source steady across renders and
 * defers swapping to a new one while the previous list is still on screen.
 * `fieldPath` is normalised on the way in, so a path array and the equivalent
 * string address the same list.
 *
 * @internal
 */
export function getDocumentCommentsOptionsKey(options: CommentsOptions): string {
  return JSON.stringify({
    documentId: options.documentId,
    documentType: options.documentType,
    projectId: options.projectId,
    dataset: options.dataset,
    resource: options.resource,
    collaboration: options.collaboration,
    perspective: options.perspective,
    fieldPath: options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath),
    status: options.status,
    variants: options.variants,
    // The `Record` half makes a new field on `CommentsOptions` a compile
    // error here unless it is listed above or named as irrelevant. Left to
    // `satisfies CommentsOptions` alone, a forgotten field would just be
    // absent from the key, and a reader would keep the list it had while the
    // caller thought it had asked for a different one.
  } satisfies CommentsOptions &
    Record<Exclude<keyof CommentsOptions, CommentsKeyIrrelevantField>, unknown>)
}

/** @internal */
export function parseDocumentCommentsOptionsKey(key: string): CommentsOptions {
  return JSON.parse(key) as CommentsOptions
}

/**
 * The same, for the GROQ escape hatch.
 *
 * @internal
 */
export function getCommentsQueryOptionsKey(options: CommentsQueryOptions): string {
  return JSON.stringify({
    filter: options.filter,
    params: options.params,
    projectId: options.projectId,
    dataset: options.dataset,
    resource: options.resource,
    collaboration: options.collaboration,
    perspective: options.perspective,
  } satisfies CommentsQueryOptions &
    Record<Exclude<keyof CommentsQueryOptions, CommentsKeyIrrelevantField>, unknown>)
}

/** @internal */
export function parseCommentsQueryOptionsKey(key: string): CommentsQueryOptions {
  return JSON.parse(key) as CommentsQueryOptions
}

/**
 * Which of a document's variants an option set covers.
 *
 * Comments hang off the published id, so pooling draft and published is the
 * default and a release keeps its own list.
 */
function toCommentsScope(instance: SanityInstance, options: CommentsOptions): CommentsScope {
  const variants = options.variants ?? 'perspective'
  if (variants === 'all') return {type: 'any'}
  if (variants === 'drafts') return {type: 'no-versions'}
  if (variants === 'exact') return {type: 'exact', sourceDocumentId: options.documentId}

  const documentId = DocumentId(options.documentId)
  const perspective = options.perspective ?? instance.config.perspective

  if (isReleasePerspective(perspective)) {
    return {
      type: 'exact',
      sourceDocumentId: getVersionId(documentId, perspective.releaseName),
    }
  }

  // A version id names a release on its own, with or without a perspective
  // saying so.
  if (isVersionId(documentId)) return {type: 'exact', sourceDocumentId: documentId}

  return {type: 'no-versions'}
}

/**
 * Which entry a document read addresses.
 *
 * The target reference comes from the client, which turns whatever id the
 * caller passed into the published one, so callers keep passing the id they
 * have.
 *
 * @internal
 */
export function toDocumentCommentsKey(
  instance: SanityInstance,
  options: CommentsOptions & {resource: DocumentResource},
): string {
  const organizationId = requireOrganizationId(instance, options)
  const client = getCommentsClient(instance, {resource: options.resource, organizationId})
  const targetRef = client.collaboration.comments.getTargetDocumentRef(options.documentId)

  return toEntryKey(organizationId, targetRef, toCommentsScope(instance, options))
}

function toEntryKey(organizationId: string, targetRef: string, scope: CommentsScope): string {
  const {filter, params} = buildDocumentCommentsQuery(targetRef, scope)
  return getCommentsKey({filter, params, organizationId})
}

/**
 * Every entry a document read could be holding a newly written comment under.
 *
 * A create shows before the server confirms it, and which lists it belongs in is
 * decided by the `variants` each reader asked for rather than by anything the
 * writer said. They all key off the comment's own target, so they can be
 * enumerated, which is what lets a reader watching one variant see a new comment
 * at the same moment as a reader watching another.
 *
 * GROQ reads are deliberately not covered: an arbitrary filter cannot be
 * evaluated locally, so those lists follow when the listener echoes the comment.
 *
 * @internal
 */
export function toWrittenCommentKeys(
  instance: SanityInstance,
  options: Pick<DatasetHandle, 'collaboration'>,
  comment: StoredComment,
): string[] {
  const organizationId = requireOrganizationId(instance, options)
  const {sourceDocumentId} = comment.target

  const scopes: CommentsScope[] = [
    {type: 'any'},
    {type: 'exact', sourceDocumentId},
    // A draft or published id belongs in the pooled list as well. A version id
    // does not, which is what keeps a release's comments out of it.
    ...(isVersionId(DocumentId(sourceDocumentId)) ? [] : [{type: 'no-versions' as const}]),
  ]

  return scopes.map((scope) => toEntryKey(organizationId, comment.target.document._ref, scope))
}

/** Which entry a GROQ read addresses. */
function toCommentsQueryKey(
  instance: SanityInstance,
  options: WithResource<CommentsQueryOptions>,
): string {
  return getCommentsKey({
    filter: buildCommentsQueryFilter(options.filter),
    params: options.params ?? {},
    organizationId: requireOrganizationId(instance, options),
  })
}

function applyEvent(
  state: StoreState<CommentsStoreState>,
  key: string,
  event: CommentsEvent,
): void {
  switch (event.type) {
    case 'snapshot':
      state.set('setComments', setComments(key, event.comments))
      return
    case 'appear':
      state.set('receiveComment', receiveComment(key, event.comment))
      return
    case 'disappear':
      state.set('removeComment', removeCommentFromEntry(key, event.commentId))
      return
    case 'error':
      state.set('setCommentsError', setCommentsError(key, event.error))
      return
    case 'update': {
      const pending = state.get().pendingTransactions[event.comment._id]

      // Our own writes come back through the listener. When a later transaction
      // is already in flight for this comment, an echo of an earlier one would
      // undo it on screen, so hold it back and wait for the one we are
      // expecting. Held rather than discarded, so that if our write fails the
      // rollback can land on this state instead of erasing it.
      if (pending && pending !== event.transactionId) {
        state.set('recordDroppedEcho', recordDroppedEcho(event.comment))
        return
      }

      state.set('receiveComment', receiveComment(key, event.comment))
      if (pending) {
        state.set('clearPendingTransaction', clearPendingTransaction(event.comment._id, pending))
      }
    }
  }
}

const watchSubscribedQueries = ({
  state,
  instance,
  key,
}: StoreContext<CommentsStoreState, BoundResourceKey>) => {
  return state.observable
    .pipe(
      map((current) => new Set(Object.keys(current.entries))),
      distinctUntilChanged(
        (a, b) => a.size === b.size && Array.from(b).every((entry) => a.has(entry)),
      ),
      startWith(new Set<string>()),
      pairwise(),
      mergeMap(([previous, current]) => [
        ...Array.from(current)
          .filter((entry) => !previous.has(entry))
          .map((entry) => ({key: entry, added: true})),
        ...Array.from(previous)
          .filter((entry) => !current.has(entry))
          .map((entry) => ({key: entry, added: false})),
      ]),
      groupBy((event) => event.key),
      mergeMap((group$) =>
        group$.pipe(
          switchMap((event) => {
            if (!event.added) return EMPTY

            const {filter, params, organizationId} = parseCommentsKey(group$.key)

            return observeCommentsClient(instance, {
              resource: key.resource,
              organizationId,
            }).pipe(
              switchMap((client) =>
                observeComments({client, filter, params}).pipe(
                  tap((commentsEvent) => applyEvent(state, group$.key, commentsEvent)),
                  // Keep following the client after one listener fails. A token
                  // refresh or reconnect can then supply a new one.
                  catchError((error: unknown) => {
                    state.set('setCommentsError', setCommentsError(group$.key, error))
                    return EMPTY
                  }),
                ),
              ),
            )
          }),
        ),
      ),
    )
    .subscribe({error: (error: unknown) => state.set('setError', {error})})
}

export const commentsStore = defineStore<CommentsStoreState, BoundResourceKey>({
  name: 'Comments',
  getInitialState: () => ({
    entries: {},
    pendingCreates: {},
    pendingTransactions: {},
    droppedEchoes: {},
  }),
  initialize: (context) => {
    const subscription = watchSubscribedQueries(context)
    return () => subscription.unsubscribe()
  },
})

/**
 * Filtered lists and their threads, cached against the comment map they came
 * from.
 *
 * Selectors run on every store change, and a fresh array each time would make
 * `useSyncExternalStore` re-render whenever anything anywhere in the store
 * moved. Keying on the comment map means a change to some other document, or
 * to an unrelated part of the state, hands back the identical array. Entries
 * die with the map they belong to.
 */
const normalizedCache = new WeakMap<object, Comment[]>()
const threadCache = new WeakMap<object, Map<string, CommentThread[]>>()

/**
 * The stored map turned into what consumers see, newest first.
 *
 * Cached alongside the filters below rather than done per read, so the
 * normalised objects keep their identity for as long as the stored map does.
 */
function normalizeAll(commentsById: Record<string, StoredComment>): Comment[] {
  const cached = normalizedCache.get(commentsById)
  if (cached) return cached

  // Newest first, matching the query's order. The store keys comments by id, so
  // the order has to be reapplied here.
  const normalized = Object.values(commentsById)
    .map(normalizeComment)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  normalizedCache.set(commentsById, normalized)
  return normalized
}

/** The entry's comments, or `undefined` while it has yet to load. */
function selectEntry(
  {state}: SelectorContext<CommentsStoreState>,
  key: string,
): Record<string, StoredComment> | undefined {
  if (state.error) throw state.error

  const entry = state.entries[key]

  // A list that has loaded keeps being served after its listener fails. The
  // comments stop updating until the listener comes back, which is worse than
  // live but better than replacing a list someone is reading with an error. A
  // failure before the first snapshot has nothing to fall back on.
  if (entry?.error && !entry.comments) throw entry.error

  return entry?.comments
}

function selectDocumentComments(
  context: SelectorContext<CommentsStoreState>,
  options: WithResource<CommentsOptions>,
): CommentThread[] | undefined {
  const comments = selectEntry(context, toDocumentCommentsKey(context.instance, options))
  if (!comments) return undefined

  const all = normalizeAll(comments)

  let byFilter = threadCache.get(all)
  if (!byFilter) {
    byFilter = new Map()
    threadCache.set(all, byFilter)
  }

  const fieldPath =
    options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath)
  const cacheKey = `${fieldPath ?? '\0'}|${options.status ?? ''}`
  const cached = byFilter.get(cacheKey)
  if (cached) return cached

  // Threads are built from every comment on the document and filtered whole, so
  // that a resolved thread's replies travel with their parent.
  const threads = buildCommentThreads(all).filter((thread) => {
    if (options.status && thread.parentComment.status !== options.status) return false
    if (fieldPath === undefined) return true
    return thread.fieldPath === fieldPath
  })
  byFilter.set(cacheKey, threads)
  return threads
}

function selectCommentsQuery(
  context: SelectorContext<CommentsStoreState>,
  options: WithResource<CommentsQueryOptions>,
): Comment[] | undefined {
  const comments = selectEntry(context, toCommentsQueryKey(context.instance, options))
  if (!comments) return undefined
  return normalizeAll(comments)
}

/**
 * Holds a subscriber for as long as something is reading the entry, and a
 * little longer, so a reader that comes straight back reuses the loaded list.
 */
function subscribeToEntry(state: StoreState<CommentsStoreState>, key: string): () => void {
  const subscriptionId = randomId(16)
  state.set('addSubscriber', addSubscriber(key, subscriptionId))

  return () => {
    setCleanupTimeout(
      () => state.set('removeSubscriber', removeSubscriber(key, subscriptionId)),
      COMMENTS_STATE_CLEAR_DELAY,
    )
  }
}

const documentCommentsState = createStateSourceAction({
  selector: selectDocumentComments,
  onSubscribe: ({state, instance}, options: WithResource<CommentsOptions>) =>
    subscribeToEntry(state, toDocumentCommentsKey(instance, options)),
})

const commentsQueryState = createStateSourceAction({
  selector: selectCommentsQuery,
  onSubscribe: ({state, instance}, options: WithResource<CommentsQueryOptions>) =>
    subscribeToEntry(state, toCommentsQueryKey(instance, options)),
})

/**
 * Threads on a document, newest thread first, each with its replies oldest
 * first.
 *
 * `undefined` until the first snapshot arrives. A thread's `status` and
 * `fieldPath` come from its first comment, so filtering by either selects whole
 * threads rather than individual replies.
 *
 * @beta
 */
export const getDocumentCommentsState: (
  instance: SanityInstance,
  options: CommentsOptions,
) => StateSource<CommentThread[] | undefined> = bindActionByResource(
  commentsStore,
  (context: StoreContext<CommentsStoreState, BoundResourceKey>, options: CommentsOptions) =>
    documentCommentsState(context, {...options, resource: context.key.resource}),
)

/**
 * Comments matching a GROQ filter, newest first, replies included.
 *
 * `undefined` until the first snapshot arrives.
 *
 * @beta
 */
export const getCommentsQueryState: (
  instance: SanityInstance,
  options: CommentsQueryOptions,
) => StateSource<Comment[] | undefined> = bindActionByResource(
  commentsStore,
  (context: StoreContext<CommentsStoreState, BoundResourceKey>, options: CommentsQueryOptions) =>
    commentsQueryState(context, {...options, resource: context.key.resource}),
)

/**
 * Waits for a document's threads to load.
 *
 * Holds a subscriber only while resolving, so a component that suspends on this
 * and then errors before mounting does not strand the list. Throw the promise
 * for Suspense, then read through {@link getDocumentCommentsState}.
 *
 * @beta
 */
export const resolveDocumentComments: (
  instance: SanityInstance,
  options: ResolveDocumentCommentsOptions,
) => Promise<CommentThread[]> = bindActionByResource(
  commentsStore,
  (
    context: StoreContext<CommentsStoreState, BoundResourceKey>,
    {signal, ...options}: ResolveDocumentCommentsOptions,
  ) => {
    const withResource = {...options, resource: context.key.resource}
    return resolveList(
      context.state,
      toDocumentCommentsKey(context.instance, withResource),
      documentCommentsState(context, withResource),
      signal,
    )
  },
)

/**
 * Waits for a GROQ comment query to load.
 *
 * @beta
 */
export const resolveCommentsQuery: (
  instance: SanityInstance,
  options: ResolveCommentsQueryOptions,
) => Promise<Comment[]> = bindActionByResource(
  commentsStore,
  (
    context: StoreContext<CommentsStoreState, BoundResourceKey>,
    {signal, ...options}: ResolveCommentsQueryOptions,
  ) => {
    const withResource = {...options, resource: context.key.resource}
    return resolveList(
      context.state,
      toCommentsQueryKey(context.instance, withResource),
      commentsQueryState(context, withResource),
      signal,
    )
  },
)

function resolveList<T>(
  state: StoreState<CommentsStoreState>,
  key: string,
  {getCurrent}: StateSource<T | undefined>,
  signal: AbortSignal | undefined,
): Promise<T> {
  // Loading is driven by subscribers, so without one here nothing would ever
  // fetch and this promise would never settle. Holding it only for the duration
  // of the resolve also means a component that suspends and then errors before
  // mounting does not leave a subscriber-less entry behind holding its error.
  const subscriptionId = randomId(16)
  state.set('addSubscriber', addSubscriber(key, subscriptionId))

  const release = () => state.set('removeSubscriber', removeSubscriber(key, subscriptionId))

  const aborted$ = signal
    ? new Observable<never>((observer) => {
        const listener = () => {
          // Release now rather than after the delay: when this was the only
          // reader, dropping the key tears down the listener immediately, which
          // is the point of aborting.
          release()
          observer.error(new DOMException('The operation was aborted.', 'AbortError'))
        }
        signal.addEventListener('abort', listener)
        return () => signal.removeEventListener('abort', listener)
      })
    : NEVER

  const resolved$ = state.observable.pipe(
    map(() => getCurrent()),
    first((value): value is T => value !== undefined),
  )

  const promise = firstValueFrom(race([resolved$, aborted$]))
  const releaseLater = () => setCleanupTimeout(release, COMMENTS_STATE_CLEAR_DELAY)
  promise.then(releaseLater, releaseLater)
  return promise
}

/**
 * The exact document id a comment is written against.
 *
 * Under a release perspective that is the document's version id, so a comment
 * written while viewing a release belongs to that release. The API derives the
 * published id it hangs off from this.
 *
 * @internal
 */
export function toSourceDocumentId(instance: SanityInstance, options: DocumentHandle): string {
  const documentId = DocumentId(options.documentId)
  const perspective = options.perspective ?? instance.config.perspective

  if (isReleasePerspective(perspective) && !isVersionId(documentId)) {
    return getVersionId(documentId, perspective.releaseName)
  }

  return documentId
}
