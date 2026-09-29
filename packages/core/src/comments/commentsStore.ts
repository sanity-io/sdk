import {DocumentId, getVersionId, isVersionId} from '@sanity/id-utils'
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

import {type DocumentHandle, type DocumentResource} from '../config/sanityConfig'
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
import {observeCommentsClientForResource, toTargetDocumentRef} from './commentsClient'
import {
  buildCommentsQueryFilter,
  buildDocumentCommentsQuery,
  COMMENTS_STATE_CLEAR_DELAY,
  type CommentsScope,
} from './commentsConstants'
import {
  type CommentsOptions,
  type CommentsQueryOptions,
  type ResolveCommentsOptions,
  type ResolveCommentsQueryOptions,
} from './commentsOptions'
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
import {type Comment, type CommentThread, type StoredComment} from './types'

/** Read options with the resource they address already resolved. */
type WithResource<T> = T & {resource: DocumentResource}

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
 * The target reference turns whatever id the caller passed into the published
 * one, so callers keep passing the id they have.
 *
 * @internal
 */
export function toDocumentCommentsKey(
  instance: SanityInstance,
  options: CommentsOptions & {resource: DocumentResource},
): string {
  const targetRef = toTargetDocumentRef(options.resource, options.documentId)

  return toEntryKey(targetRef, toCommentsScope(instance, options))
}

function toEntryKey(targetRef: string, scope: CommentsScope): string {
  const {filter, params} = buildDocumentCommentsQuery(targetRef, scope)
  return getCommentsKey({filter, params})
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
export function toWrittenCommentKeys(comment: StoredComment): string[] {
  const {sourceDocumentId} = comment.target

  const scopes: CommentsScope[] = [
    {type: 'any'},
    {type: 'exact', sourceDocumentId},
    // A draft or published id belongs in the pooled list as well. A version id
    // does not, which is what keeps a release's comments out of it.
    ...(isVersionId(DocumentId(sourceDocumentId)) ? [] : [{type: 'no-versions' as const}]),
  ]

  return scopes.map((scope) => toEntryKey(comment.target.document._ref, scope))
}

/** Which entry a GROQ read addresses. */
function toCommentsQueryKey(options: WithResource<CommentsQueryOptions>): string {
  return getCommentsKey({
    filter: buildCommentsQueryFilter(options.filter),
    params: options.params ?? {},
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

            const {filter, params} = parseCommentsKey(group$.key)

            return observeCommentsClientForResource(instance, key.resource).pipe(
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
              // Resolving the organization can fail too — an unreachable project
              // read, or a configured organization that does not own it. Same
              // treatment: the entry carries it rather than taking the store down.
              catchError((error: unknown) => {
                state.set('setCommentsError', setCommentsError(group$.key, error))
                return EMPTY
              }),
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
    pendingRemovals: {},
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
const filteredCache = new WeakMap<object, Map<string, Comment[]>>()
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

/** How a filter on a document read is written into a per-list cache key. */
function toFilterCacheKey(options: CommentsOptions): string {
  const fieldPath =
    options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath)
  // `\0` stands in for "no field filter", which is not the same as `''`.
  return `${fieldPath ?? '\0'}|${options.status ?? ''}`
}

/** Every comment on a document, newest first, filtered but not grouped. */
function selectComments(
  context: SelectorContext<CommentsStoreState>,
  options: WithResource<CommentsOptions>,
): Comment[] | undefined {
  const comments = selectEntry(context, toDocumentCommentsKey(context.instance, options))
  if (!comments) return undefined

  const all = normalizeAll(comments)

  let byFilter = filteredCache.get(all)
  if (!byFilter) {
    byFilter = new Map()
    filteredCache.set(all, byFilter)
  }

  const cacheKey = toFilterCacheKey(options)
  const cached = byFilter.get(cacheKey)
  if (cached) return cached

  const fieldPath =
    options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath)
  const filtered = all.filter((comment) => {
    if (options.status && comment.status !== options.status) return false
    if (fieldPath === undefined) return true
    return comment.fieldPath === fieldPath
  })
  byFilter.set(cacheKey, filtered)
  return filtered
}

function selectCommentThreads(
  context: SelectorContext<CommentsStoreState>,
  options: WithResource<CommentsOptions>,
): CommentThread[] | undefined {
  // Threads are built from every comment on the document and filtered whole, so
  // that a resolved thread's replies travel with their parent.
  const all = selectComments(context, {...options, fieldPath: undefined, status: undefined})
  if (!all) return undefined

  let byFilter = threadCache.get(all)
  if (!byFilter) {
    byFilter = new Map()
    threadCache.set(all, byFilter)
  }

  const cacheKey = toFilterCacheKey(options)
  const cached = byFilter.get(cacheKey)
  if (cached) return cached

  const fieldPath =
    options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath)
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
  const comments = selectEntry(context, toCommentsQueryKey(options))
  if (!comments) return undefined
  return normalizeAll(comments)
}

/**
 * Why an entry's list stopped following the server, if it has.
 *
 * Only ever set on a list that had already loaded: a failure before the first
 * snapshot is thrown from the read itself, since there is nothing to go stale.
 */
function selectEntryError(
  {state}: SelectorContext<CommentsStoreState>,
  key: string,
): unknown | undefined {
  const entry = state.entries[key]
  return entry?.comments ? entry.error : undefined
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

const commentsState = createStateSourceAction({
  selector: selectComments,
  onSubscribe: ({state, instance}, options: WithResource<CommentsOptions>) =>
    subscribeToEntry(state, toDocumentCommentsKey(instance, options)),
})

const commentThreadsState = createStateSourceAction({
  selector: selectCommentThreads,
  onSubscribe: ({state, instance}, options: WithResource<CommentsOptions>) =>
    subscribeToEntry(state, toDocumentCommentsKey(instance, options)),
})

const commentsQueryState = createStateSourceAction({
  selector: selectCommentsQuery,
  onSubscribe: ({state}, options: WithResource<CommentsQueryOptions>) =>
    subscribeToEntry(state, toCommentsQueryKey(options)),
})

// No `onSubscribe`: whoever is watching for an error is reading the list beside
// it, and that read is what holds the entry open.
const commentsErrorState = createStateSourceAction(
  (context: SelectorContext<CommentsStoreState>, options: WithResource<CommentsOptions>) =>
    selectEntryError(context, toDocumentCommentsKey(context.instance, options)),
)

const commentsQueryErrorState = createStateSourceAction(
  (context: SelectorContext<CommentsStoreState>, options: WithResource<CommentsQueryOptions>) =>
    selectEntryError(context, toCommentsQueryKey(options)),
)

/**
 * Every comment on a document, newest first.
 *
 * `undefined` until the first snapshot arrives. Replies are included; use
 * {@link getCommentThreadsState} to read them grouped.
 *
 * @beta
 */
export const getCommentsState: (
  instance: SanityInstance,
  options: CommentsOptions,
) => StateSource<Comment[] | undefined> = bindActionByResource(
  commentsStore,
  (context: StoreContext<CommentsStoreState, BoundResourceKey>, options: CommentsOptions) =>
    commentsState(context, {...options, resource: context.key.resource}),
)

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
export const getCommentThreadsState: (
  instance: SanityInstance,
  options: CommentsOptions,
) => StateSource<CommentThread[] | undefined> = bindActionByResource(
  commentsStore,
  (context: StoreContext<CommentsStoreState, BoundResourceKey>, options: CommentsOptions) =>
    commentThreadsState(context, {...options, resource: context.key.resource}),
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
 * Why a document's comments stopped following the server, if they have.
 *
 * A list that has loaded survives its listener failing: it keeps being served
 * as it last stood rather than replacing what someone is reading with an error.
 * This is how that is noticed. It clears when a listener comes back, which
 * happens on the next client change — a token refresh, typically.
 *
 * `undefined` while the list is live, and while it has yet to load at all: a
 * failure before the first snapshot is thrown from the read instead.
 *
 * @beta
 */
export const getCommentsErrorState: (
  instance: SanityInstance,
  options: CommentsOptions,
) => StateSource<unknown> = bindActionByResource(
  commentsStore,
  (context: StoreContext<CommentsStoreState, BoundResourceKey>, options: CommentsOptions) =>
    commentsErrorState(context, {...options, resource: context.key.resource}),
)

/**
 * The same, for a GROQ comment query. See {@link getCommentsErrorState}.
 *
 * @beta
 */
export const getCommentsQueryErrorState: (
  instance: SanityInstance,
  options: CommentsQueryOptions,
) => StateSource<unknown> = bindActionByResource(
  commentsStore,
  (context: StoreContext<CommentsStoreState, BoundResourceKey>, options: CommentsQueryOptions) =>
    commentsQueryErrorState(context, {...options, resource: context.key.resource}),
)

/**
 * Waits for a document's comments to load.
 *
 * Holds a subscriber only while resolving, so a component that suspends on this
 * and then errors before mounting does not strand the list. Throw the promise
 * for Suspense, then read through {@link getCommentsState}.
 *
 * @beta
 */
export const resolveComments: (
  instance: SanityInstance,
  options: ResolveCommentsOptions,
) => Promise<Comment[]> = bindActionByResource(
  commentsStore,
  (
    context: StoreContext<CommentsStoreState, BoundResourceKey>,
    {signal, ...options}: ResolveCommentsOptions,
  ) => {
    const withResource = {...options, resource: context.key.resource}
    return resolveList(
      context.state,
      toDocumentCommentsKey(context.instance, withResource),
      commentsState(context, withResource),
      signal,
    )
  },
)

/**
 * Waits for a document's comments to load, grouped into threads.
 *
 * @beta
 */
export const resolveCommentThreads: (
  instance: SanityInstance,
  options: ResolveCommentsOptions,
) => Promise<CommentThread[]> = bindActionByResource(
  commentsStore,
  (
    context: StoreContext<CommentsStoreState, BoundResourceKey>,
    {signal, ...options}: ResolveCommentsOptions,
  ) => {
    const withResource = {...options, resource: context.key.resource}
    return resolveList(
      context.state,
      toDocumentCommentsKey(context.instance, withResource),
      commentThreadsState(context, withResource),
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
      toCommentsQueryKey(withResource),
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
