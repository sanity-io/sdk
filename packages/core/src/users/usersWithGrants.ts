import {type SanityDocument} from '@sanity/types'
import {type ExprNode} from 'groq-js'
import {combineLatest, distinctUntilChanged, map, shareReplay} from 'rxjs'

import {
  type DatasetHandle,
  type DatasetResource,
  type DocumentHandle,
  isDatasetResource,
} from '../config/sanityConfig'
import {getDocumentState, resolveDocument} from '../document/documentStore'
import {createGrantsLookup, type Grant} from '../document/permissions'
import {checkGrant} from '../document/processActions/shared'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type FetcherSnapshot} from '../store/fetcherStore'
import {type SystemGroup, systemGroups} from './systemGroups'
import {type GetUsersOptions, type SanityUser} from './types'
import {DEFAULT_USERS_BATCH_SIZE} from './usersConstants'
import {getUsersState, loadMoreUsers, resolveUsers} from './usersStore'

/**
 * Which of a project's users to read, and the document to measure them against.
 *
 * The audience is the document's own project rather than anything the caller
 * picks: a dataset's access groups identify their members by project user id,
 * which only a project users read returns inline.
 *
 * @beta
 */
export interface UsersWithGrantsOptions {
  /**
   * Annotate each user with whether they can read this document. Users who
   * cannot are still returned, carrying `granted: false`, so a picker can show
   * them as unavailable rather than silently dropping them.
   */
  document: DocumentHandle
  /** How many users to read per page. */
  batchSize?: number
  /** Narrows to users whose display name contains this, ignoring case. */
  displayName?: string
  /**
   * Narrows to users whose email contains this, ignoring case. Combined with
   * `displayName` it narrows to users matching both, not either.
   */
  email?: string
  /** The only field the API can sort on. */
  sortBy?: 'displayName'
  /** @defaultValue 'asc', when `sortBy` is set */
  orderBy?: 'asc' | 'desc'
}

/**
 * A user, plus whether they can read the requested document.
 *
 * @beta
 */
export interface UserWithGrants extends SanityUser {
  granted: boolean
}

/**
 * @beta
 */
export interface UsersWithGrantsResult {
  data: UserWithGrants[]
  totalCount: number
  hasMore: boolean
}

/**
 * @beta
 */
export interface ResolveUsersWithGrantsOptions extends UsersWithGrantsOptions {
  signal?: AbortSignal
}

interface UsersState {
  data: SanityUser[]
  totalCount: number
  hasMore: boolean
}

/** One grant entry from one access group, compiled ready to evaluate. */
interface CompiledGrant {
  members: ReadonlySet<string>
  expression: ExprNode
}

const toUsersOptions = (
  {document: _document, ...usersOptions}: UsersWithGrantsOptions,
  resource: DatasetResource,
): GetUsersOptions => ({
  ...usersOptions,
  resourceType: 'project',
  // The project the access groups belong to, rather than whichever one is
  // ambient. Reading users from one project and measuring them against
  // another's groups would deny everybody, since a project user id only means
  // anything within its own project.
  projectId: resource.projectId,
})

/**
 * The dataset holding both the document and the access groups that decide who
 * may read it. Resolved exactly the way `bindActionByResource` resolves the
 * document read itself, so the two can never disagree about which dataset they
 * are talking about.
 */
function resolveGrantsResource(instance: SanityInstance, handle: DatasetHandle): DatasetResource {
  const resource = handle.resource ?? instance.config.resource
  if (resource) {
    if (!isDatasetResource(resource)) {
      throw new Error(
        `Document grants are only supported for dataset resources, received: ${JSON.stringify(resource)}`,
      )
    }
    return resource
  }

  const {projectId, dataset} = instance.config
  if (!projectId || !dataset) {
    throw new Error('Evaluating document grants requires a project ID and dataset.')
  }
  return {projectId, dataset}
}

/**
 * The id a dataset's access groups know this user by. `undefined` when the user
 * holds no membership in the project.
 */
function resolveProjectUserId(user: SanityUser, projectId: string): string | undefined {
  return user.memberships.find(
    (membership) => membership.resourceType === 'project' && membership.resourceId === projectId,
  )?.resourceUserId
}

/**
 * A public dataset's read group lists this instead of naming every user.
 */
const EVERYONE = 'everyone'

/**
 * The grant this read measures. Visibility is the question a user picker asks,
 * and the only one anything needs answered so far.
 */
const GRANT: Grant = 'read'

/**
 * One expression per grant entry rather than per group, so a filter that fails
 * to compile denies only itself instead of every grant beside it.
 */
function compileGrant(filter: string): ExprNode | undefined {
  try {
    return createGrantsLookup([{filter, permissions: [GRANT]}])[GRANT]
  } catch {
    return undefined
  }
}

function compileGroup(group: SystemGroup): CompiledGrant[] {
  if (!group.members?.length) return []
  const members = new Set(group.members)

  return (group.grants ?? [])
    .filter((entry) => entry.permissions.includes(GRANT))
    .map((entry) => compileGrant(entry.filter))
    .filter((expression): expression is ExprNode => expression !== undefined)
    .map((expression) => ({members, expression}))
}

function isGranted(compiled: CompiledGrant[], userId: string, document: SanityDocument): boolean {
  return compiled.some(({members, expression}) => {
    if (!members.has(userId) && !members.has(EVERYONE)) return false
    try {
      return checkGrant(expression, document, userId)
    } catch {
      // Some filters cannot be evaluated client-side at all, `user::attributes()`
      // among them. Fail the individual grant closed rather than the whole set.
      return false
    }
  })
}

/** Everything needed to answer `granted` for a user. */
interface GrantsContext {
  groups: SystemGroup[]
  document: SanityDocument | null
  projectId: string
}

/**
 * A document that does not exist denies everyone. A grant is a filter measured
 * against a document, so with no document there is nothing anyone can be shown
 * to hold, and reporting the whole project as able to read something that is
 * not there would be the more misleading of the two answers.
 */
function annotate(users: SanityUser[], context: GrantsContext): UserWithGrants[] {
  if (!context.document) return users.map((user) => ({...user, granted: false}))

  const {groups, document, projectId} = context
  const compiled = groups.flatMap(compileGroup)
  return users.map((user) => {
    const projectUserId = resolveProjectUserId(user, projectId)
    return {
      ...user,
      granted: projectUserId === undefined ? false : isGranted(compiled, projectUserId, document),
    }
  })
}

/**
 * Keeps `getCurrent` referentially stable while its inputs are, which
 * `useSyncExternalStore` requires of a snapshot.
 */
function memoizeLast<TArgs extends unknown[], R>(fn: (...args: TArgs) => R): (...args: TArgs) => R {
  let last: {args: TArgs; result: R} | undefined
  return (...args) => {
    if (last && last.args.every((arg, index) => arg === args[index])) return last.result
    const result = fn(...args)
    last = {args, result}
    return result
  }
}

/**
 * Whether a fetched input is still loading, throwing if it failed outright.
 * Grants decide what a user can see, so a failed read has to surface rather
 * than fall back to an answer nobody checked.
 */
function isPending(snapshot: FetcherSnapshot<unknown> | undefined): boolean {
  if (!snapshot) return false
  if (snapshot.status === 'error') throw snapshot.error
  return snapshot.status === 'pending'
}

function toResult(users: UsersState, context: GrantsContext): UsersWithGrantsResult {
  return {
    data: annotate(users.data, context),
    totalCount: users.totalCount,
    hasMore: users.hasMore,
  }
}

/**
 * Returns the state source for a project's users, each annotated with whether
 * they can read a document.
 *
 * Reads the dataset's access groups and the document itself, then evaluates
 * each group's GROQ filters per user. That evaluation is the only way to answer
 * for a user other than the current one: the dataset ACL endpoint answers for
 * the requesting session alone.
 *
 * Note: This functionality is for advanced users who want to build their own framework
 * integrations. Our SDK also provides a React integration for convenient usage.
 *
 * @beta
 */
export function getUsersWithGrantsState(
  instance: SanityInstance,
  options: UsersWithGrantsOptions,
): StateSource<UsersWithGrantsResult | undefined> {
  const {document} = options
  const resource = resolveGrantsResource(instance, document)
  const usersSource = getUsersState(instance, toUsersOptions(options, resource))

  const groupsSource = systemGroups.getState(instance, resource)
  const documentSource = getDocumentState(instance, {...document, path: undefined})

  const compute = memoizeLast(
    (
      users: UsersState | undefined,
      groups: FetcherSnapshot<SystemGroup[]> | undefined,
      documentValue: SanityDocument | null | undefined,
    ): UsersWithGrantsResult | undefined => {
      if (!users) return undefined

      // Annotating against a half-known set of groups would report users as
      // having no access when the answer is simply not in yet.
      if (isPending(groups) || documentValue === undefined) return undefined

      return toResult(users, {
        groups: groups?.data ?? [],
        document: documentValue,
        projectId: resource.projectId,
      })
    },
  )

  return {
    getCurrent: () =>
      compute(usersSource.getCurrent(), groupsSource.getCurrent(), documentSource.getCurrent()),
    subscribe: (onStoreChanged?: () => void) => {
      const unsubscribers = [
        usersSource.subscribe(onStoreChanged),
        groupsSource.subscribe(onStoreChanged),
        documentSource.subscribe(onStoreChanged),
      ]
      return () => {
        for (const unsubscribe of unsubscribers) unsubscribe()
      }
    },
    observable: combineLatest([
      usersSource.observable,
      groupsSource.observable,
      documentSource.observable,
    ]).pipe(
      map(([users, groups, documentValue]) => compute(users, groups, documentValue)),
      distinctUntilChanged(),
      shareReplay({bufferSize: 1, refCount: true}),
    ),
  }
}

/**
 * Resolves a project's users and their grants without registering a lasting
 * subscriber, for use with React Suspense. See `resolveUsers` for the wider
 * contract, including the `signal` behaviour.
 *
 * @beta
 */
export async function resolveUsersWithGrants(
  instance: SanityInstance,
  options: ResolveUsersWithGrantsOptions,
): Promise<UsersWithGrantsResult | undefined> {
  const {signal, document} = options
  const resource = resolveGrantsResource(instance, document)

  const [users, groups, documentValue] = await Promise.all([
    resolveUsers(instance, {...toUsersOptions(options, resource), signal}),
    systemGroups.resolveState(instance, resource),
    resolveDocument(instance, document),
  ])

  if (!users) return undefined

  return toResult(users, {
    groups,
    document: documentValue,
    projectId: resource.projectId,
  })
}

/**
 * Loads the next page of users for the same read. Grants are re-evaluated over
 * the extended list.
 *
 * @beta
 */
export function loadMoreUsersWithGrants(
  instance: SanityInstance,
  options: UsersWithGrantsOptions,
): Promise<unknown> {
  return loadMoreUsers(
    instance,
    toUsersOptions(options, resolveGrantsResource(instance, options.document)),
  )
}

/**
 * @internal
 *
 * Spelled out field by field, rather than stringifying the options as given, so
 * the key doesn't change with the key order of a caller's object literal.
 *
 * No instance needed, unlike `getUsersKey`: everything this read resolves comes
 * from the document, so a handle plus the search terms names it completely.
 */
export const getUsersWithGrantsKey = (options: UsersWithGrantsOptions): string => {
  const {document} = options
  return JSON.stringify({
    batchSize: options.batchSize ?? DEFAULT_USERS_BATCH_SIZE,
    displayName: options.displayName,
    email: options.email,
    sortBy: options.sortBy,
    orderBy: options.orderBy,
    document: {
      documentId: document.documentId,
      documentType: document.documentType,
      projectId: document.projectId,
      dataset: document.dataset,
      resource: document.resource,
      liveEdit: document.liveEdit,
      perspective: document.perspective,
    },
  } satisfies UsersWithGrantsOptions)
}

/** @internal */
export const parseUsersWithGrantsKey = (key: string): UsersWithGrantsOptions =>
  JSON.parse(key) as UsersWithGrantsOptions
