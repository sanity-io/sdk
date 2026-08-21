import {DocumentId, getPublishedId} from '@sanity/id-utils'
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

import {type DocumentHandle} from '../config/sanityConfig'
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
import {insecureRandomId} from '../utils/ids'
import {setCleanupTimeout} from '../utils/setCleanupTimeout'
import {observeAddonDatasetClient} from './addonDatasetStore'
import {buildCommentThreads} from './buildCommentThreads'
import {toCommentFieldPath} from './commentFieldPath'
import {COMMENTS_STATE_CLEAR_DELAY} from './commentsConstants'
import {normalizeComment} from './normalizeComment'
import {type CommentsEvent, observeComments} from './observeComments'
import {
  addSubscriber,
  clearPendingTransaction,
  type CommentsKeyParts,
  type CommentsStoreState,
  getCommentsKey,
  parseCommentsKey,
  receiveComment,
  removeCommentById,
  removeSubscriber,
  setComments,
  setCommentsError,
} from './reducers'
import {type Comment, type CommentStatus, type CommentThread, type StoredComment} from './types'

/**
 * Which comments to read.
 * @beta
 */
export interface CommentsOptions extends DocumentHandle {
  /**
   * Narrow to one field. Omit to get every comment on the document.
   */
  fieldPath?: string | Path
  /** Narrow to open or resolved threads. Omit for both. */
  status?: CommentStatus
}

/** @beta */
export interface ResolveCommentsOptions extends CommentsOptions {
  signal?: AbortSignal
}

/**
 * Fields on {@link CommentsOptions} that are deliberately left out of the key
 * below, because neither changes which comments an option set addresses.
 *
 * `source` is the deprecated alias for `resource` and is folded into it before
 * a key is ever built, so keying on both would give one list two keys.
 * `liveEdit` describes the document rather than its comments, which hang off
 * the published id whether or not drafts exist.
 */
type CommentsKeyIrrelevantField = 'source' | 'liveEdit'

/**
 * A stable string standing for one set of read options.
 *
 * Only React needs this: it holds one state source steady across renders and
 * defers swapping to a new one while the previous list is still on screen.
 * `fieldPath` is normalised on the way in, so a path array and the equivalent
 * string address the same list.
 *
 * @internal
 */
export function getCommentsOptionsKey(options: CommentsOptions): string {
  return JSON.stringify({
    documentId: options.documentId,
    documentType: options.documentType,
    projectId: options.projectId,
    dataset: options.dataset,
    resource: options.resource,
    perspective: options.perspective,
    fieldPath: options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath),
    status: options.status,
    // The `Record` half makes a new field on `CommentsOptions` a compile
    // error here unless it is listed above or named as irrelevant. Left to
    // `satisfies CommentsOptions` alone, a forgotten field would just be
    // absent from the key, and a reader would keep the list it had while the
    // caller thought it had asked for a different one.
  } satisfies CommentsOptions &
    Record<Exclude<keyof CommentsOptions, CommentsKeyIrrelevantField>, unknown>)
}

/** @internal */
export function parseCommentsOptionsKey(key: string): CommentsOptions {
  return JSON.parse(key) as CommentsOptions
}

/**
 * Which comment list an option set addresses.
 *
 * Comments hang off the published id, so a draft and its published document
 * share one list. A release keeps its own.
 */
export function toCommentsKeyParts(
  instance: SanityInstance,
  options: CommentsOptions,
): CommentsKeyParts {
  const perspective = options.perspective ?? instance.config.perspective
  return {
    documentId: getPublishedId(DocumentId(options.documentId)),
    ...(isReleasePerspective(perspective) ? {documentVersionId: perspective.releaseName} : {}),
  }
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
      state.set('removeComment', removeCommentById(event.commentId))
      return
    case 'error':
      state.set('setCommentsError', setCommentsError(key, event.error))
      return
    case 'update': {
      const pending = state.get().pendingTransactions[event.comment._id]

      // Our own writes come back through the listener. When a later transaction
      // is already in flight for this comment, an echo of an earlier one would
      // undo it on screen, so drop it and wait for the one we are expecting.
      if (pending && pending !== event.transactionId) return

      state.set('receiveComment', receiveComment(key, event.comment))
      if (pending) {
        state.set('clearPendingTransaction', clearPendingTransaction(event.comment._id))
      }
    }
  }
}

const watchSubscribedDocuments = ({
  state,
  instance,
  key,
}: StoreContext<CommentsStoreState, BoundResourceKey>) => {
  const client$ = observeAddonDatasetClient(instance, {resource: key.resource})

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

            const {documentId, documentVersionId} = parseCommentsKey(group$.key)

            return client$.pipe(
              switchMap((client) => {
                if (!client) {
                  // A dataset that does not exist holds no comments. Settling on
                  // an empty list matters: leaving it unset would suspend
                  // readers forever on a project nobody has commented in.
                  state.set('setComments', setComments(group$.key, []))
                  return EMPTY
                }

                return observeComments({client, documentId, documentVersionId}).pipe(
                  tap((commentsEvent) => applyEvent(state, group$.key, commentsEvent)),
                  // Keep following the addon client after one listener fails.
                  // A token refresh or reconnect can then supply a new client.
                  catchError((error: unknown) => {
                    state.set('setCommentsError', setCommentsError(group$.key, error))
                    return EMPTY
                  }),
                )
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
  }),
  initialize: (context) => {
    const subscription = watchSubscribedDocuments(context)
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

function filterComments(
  all: Comment[],
  fieldPath: string | undefined,
  status: CommentStatus | undefined,
): Comment[] {
  let byFilter = filteredCache.get(all)
  if (!byFilter) {
    byFilter = new Map()
    filteredCache.set(all, byFilter)
  }

  // `\0` stands in for "no field filter", which is not the same as `''`.
  const cacheKey = `${fieldPath ?? '\0'}|${status ?? ''}`
  const cached = byFilter.get(cacheKey)
  if (cached) return cached

  const filtered = all.filter((comment) => {
    if (status && comment.status !== status) return false
    if (fieldPath === undefined) return true
    return comment.fieldPath === fieldPath
  })

  byFilter.set(cacheKey, filtered)
  return filtered
}

function selectComments(
  {state, instance}: SelectorContext<CommentsStoreState>,
  options: CommentsOptions,
): Comment[] | undefined {
  if (state.error) throw state.error

  const entry = state.entries[getCommentsKey(toCommentsKeyParts(instance, options))]
  if (entry?.error) throw entry.error
  if (!entry?.comments) return undefined

  return filterComments(
    normalizeAll(entry.comments),
    options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath),
    options.status,
  )
}

function selectCommentThreads(
  context: SelectorContext<CommentsStoreState>,
  options: CommentsOptions,
): CommentThread[] | undefined {
  const comments = selectComments(context, {...options, fieldPath: undefined, status: undefined})
  if (comments === undefined) return undefined

  let byFilter = threadCache.get(comments)
  if (!byFilter) {
    byFilter = new Map()
    threadCache.set(comments, byFilter)
  }

  const fieldPath =
    options.fieldPath === undefined ? undefined : toCommentFieldPath(options.fieldPath)
  const cacheKey = `${fieldPath ?? '\0'}|${options.status ?? ''}`
  const cached = byFilter.get(cacheKey)
  if (cached) return cached

  const threads = buildCommentThreads(comments).filter((thread) => {
    if (options.status && thread.parentComment.status !== options.status) return false
    if (fieldPath === undefined) return true
    return thread.fieldPath === fieldPath
  })
  byFilter.set(cacheKey, threads)
  return threads
}

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
  createStateSourceAction({
    selector: selectComments,
    onSubscribe: ({state, instance}, options: CommentsOptions) => {
      const key = getCommentsKey(toCommentsKeyParts(instance, options))
      const subscriptionId = insecureRandomId()
      state.set('addSubscriber', addSubscriber(key, subscriptionId))

      return () => {
        setCleanupTimeout(
          () => state.set('removeSubscriber', removeSubscriber(key, subscriptionId)),
          COMMENTS_STATE_CLEAR_DELAY,
        )
      }
    },
  }),
)

/**
 * Threads on a document, newest thread first, each with its replies oldest first.
 *
 * A thread's `status` and `fieldPath` come from its first comment, so filtering
 * by either selects whole threads rather than individual replies.
 *
 * @beta
 */
export const getCommentThreadsState: (
  instance: SanityInstance,
  options: CommentsOptions,
) => StateSource<CommentThread[] | undefined> = bindActionByResource(
  commentsStore,
  createStateSourceAction({
    selector: selectCommentThreads,
    onSubscribe: ({state, instance}, options: CommentsOptions) => {
      const key = getCommentsKey(toCommentsKeyParts(instance, options))
      const subscriptionId = insecureRandomId()
      state.set('addSubscriber', addSubscriber(key, subscriptionId))

      return () => {
        setCleanupTimeout(
          () => state.set('removeSubscriber', removeSubscriber(key, subscriptionId)),
          COMMENTS_STATE_CLEAR_DELAY,
        )
      }
    },
  }),
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
    {state, instance}: StoreContext<CommentsStoreState, BoundResourceKey>,
    {signal, ...options}: ResolveCommentsOptions,
  ) => resolveList(state, instance, options, signal, getCommentsState),
)

/**
 * Waits for a document's comments to load, grouped into threads.
 * @beta
 */
export const resolveCommentThreads: (
  instance: SanityInstance,
  options: ResolveCommentsOptions,
) => Promise<CommentThread[]> = bindActionByResource(
  commentsStore,
  (
    {state, instance}: StoreContext<CommentsStoreState, BoundResourceKey>,
    {signal, ...options}: ResolveCommentsOptions,
  ) => resolveList(state, instance, options, signal, getCommentThreadsState),
)

function resolveList<T>(
  state: StoreState<CommentsStoreState>,
  instance: SanityInstance,
  options: CommentsOptions,
  signal: AbortSignal | undefined,
  getState: (i: SanityInstance, o: CommentsOptions) => StateSource<T | undefined>,
): Promise<T> {
  const key = getCommentsKey(toCommentsKeyParts(instance, options))
  const {getCurrent} = getState(instance, options)

  // Loading is driven by subscribers, so without one here nothing would ever
  // fetch and this promise would never settle. Holding it only for the duration
  // of the resolve also means a component that suspends and then errors before
  // mounting does not leave a subscriber-less entry behind holding its error.
  const subscriptionId = insecureRandomId()
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
