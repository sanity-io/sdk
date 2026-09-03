import {type SanityDocument} from '@sanity/types'
import {type ExprNode} from 'groq-js'
import {combineLatest, distinctUntilChanged, map, of, shareReplay} from 'rxjs'

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
import {type ProjectUserIds, projectUserIds} from './projectUserIds'
import {getUsersKey} from './reducers'
import {type SystemGroup, systemGroups} from './systemGroups'
import {type GetUsersOptions, type Membership, type SanityUser} from './types'
import {getUsersState, loadMoreUsers, resolveUsers} from './usersStore'

/**
 * Which users to read, and optionally which document to measure them against.
 *
 * @beta
 */
export interface UsersWithGrantsOptions extends GetUsersOptions {
  /**
   * Annotate each user with whether they hold `grant` on this document. Users
   * who do not are still returned, carrying `granted: false`, so a picker can
   * show them as unavailable rather than silently dropping them.
   *
   * Combines with either audience. Organization members who are not members
   * of the document's project come back as `granted: false`.
   *
   * An organization audience costs an extra read: access groups identify their
   * members by project user id, which only a project users read returns
   * inline, so the project's id map has to be walked and cached first.
   */
  document?: DocumentHandle
  /**
   * The grant to measure. Only meaningful alongside `document`.
   *
   * @defaultValue 'read'
   */
  grant?: Grant
}

/**
 * A user, plus whether they hold the requested grant on the requested document.
 * Without a document every user is `granted: true`.
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

const toUsersOptions = ({
  document: _document,
  grant: _grant,
  ...usersOptions
}: UsersWithGrantsOptions): GetUsersOptions => usersOptions

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
 * The audience the users read itself will pick. Mirrors `usersStore`, which
 * lets an explicit `resourceType` win, then infers from whichever id it was
 * given, and falls back to the dashboard's organization. Reproduced here so
 * the two can't disagree about whether a project user id will be inline.
 */
function resolveAudience(options: GetUsersOptions): 'organization' | 'project' {
  return (
    options.resourceType ??
    (options.organizationId ? 'organization' : options.projectId ? 'project' : 'organization')
  )
}

/**
 * A project users read carries each member's project user id inline, but an
 * organization one does not, so that audience needs the separate lookup.
 */
function needsProjectUserIds(options: UsersWithGrantsOptions): boolean {
  return resolveAudience(options) === 'organization'
}

const findProjectMembership = (user: SanityUser, projectId: string): Membership | undefined =>
  user.memberships.find(
    (membership) => membership.resourceType === 'project' && membership.resourceId === projectId,
  )

/**
 * The id a dataset's access groups know this user by. `undefined` when the user
 * holds no membership in the project, which is the case for organization
 * members who were never added to it.
 */
function resolveProjectUserId(
  user: SanityUser,
  projectId: string,
  projectUserIdsById: ProjectUserIds | undefined,
): string | undefined {
  return (
    findProjectMembership(user, projectId)?.resourceUserId ??
    projectUserIdsById?.get(user.sanityUserId)
  )
}

/**
 * A public dataset's read group lists this instead of naming every user.
 */
const EVERYONE = 'everyone'

// Compiling a filter means parsing GROQ, so it is done once per set of groups
// rather than once per user. The fetcher hands back the same array while its
// entry is cached, which makes it a usable weak key.
const compiledGrants = new WeakMap<SystemGroup[], Map<Grant, CompiledGrant[]>>()

/**
 * One expression per grant entry rather than per group, so a filter that fails
 * to compile denies only itself instead of every grant beside it.
 */
function compileGrant(filter: string, grant: Grant): ExprNode | undefined {
  try {
    return createGrantsLookup([{filter, permissions: [grant]}])[grant]
  } catch {
    return undefined
  }
}

function compileGroup(group: SystemGroup, grant: Grant): CompiledGrant[] {
  if (!group.members?.length) return []
  const members = new Set(group.members)

  return (group.grants ?? [])
    .filter((entry) => entry.permissions.includes(grant))
    .map((entry) => compileGrant(entry.filter, grant))
    .filter((expression): expression is ExprNode => expression !== undefined)
    .map((expression) => ({members, expression}))
}

function compileGrants(groups: SystemGroup[], grant: Grant): CompiledGrant[] {
  const byGrant = compiledGrants.get(groups) ?? new Map<Grant, CompiledGrant[]>()
  compiledGrants.set(groups, byGrant)

  const cached = byGrant.get(grant)
  if (cached) return cached

  const compiled = groups.flatMap((group) => compileGroup(group, grant))
  byGrant.set(grant, compiled)
  return compiled
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
  grant: Grant
  projectId: string
  /** Only needed for an audience whose users carry no project user id. */
  projectUserIdsById?: ProjectUserIds
}

/**
 * A missing document counts as granted, matching the Studio: there is nothing
 * to measure a filter against, and denying everyone would be a worse default
 * for a picker rendered before its document exists.
 */
function annotate(users: SanityUser[], context: GrantsContext | undefined): UserWithGrants[] {
  if (!context?.document) return users.map((user) => ({...user, granted: true}))

  const {groups, document, grant, projectId, projectUserIdsById} = context
  const compiled = compileGrants(groups, grant)
  return users.map((user) => {
    const projectUserId = resolveProjectUserId(user, projectId, projectUserIdsById)
    return {
      ...user,
      granted: projectUserId === undefined ? false : isGranted(compiled, projectUserId, document),
    }
  })
}

interface RepairState {
  /** Projects with a rebuild in flight, so concurrent reads share the one walk. */
  inFlight: Set<string>
  /**
   * Users a *completed* rebuild still could not explain, so they don't provoke
   * a fresh walk of the member list on every read. A failed rebuild records
   * nothing, leaving a transient failure free to retry.
   */
  unexplained: Set<string>
}

const repairStates = new WeakMap<SanityInstance, RepairState>()

function getRepairState(instance: SanityInstance): RepairState {
  const existing = repairStates.get(instance)
  if (existing) return existing

  const created: RepairState = {inFlight: new Set(), unexplained: new Set()}
  repairStates.set(instance, created)
  return created
}

/**
 * Users the map owes an id and has none for. A member of the project
 * necessarily has a project user id, so a membership with no id beside it
 * proves the map was built before they joined rather than saying anything
 * about their access.
 */
function findUnmappedUsers(
  users: SanityUser[],
  projectId: string,
  projectUserIdsById: ProjectUserIds,
): string[] {
  return users
    .filter((user) => {
      const membership = findProjectMembership(user, projectId)
      return membership && !membership.resourceUserId && !projectUserIdsById.has(user.sanityUserId)
    })
    .map((user) => user.sanityUserId)
}

/**
 * Rebuilds the project user id map when it cannot explain a member of the
 * project. Detecting that is what lets the map be cached for an hour: the one
 * thing staleness can get wrong here announces itself, leaving nothing to wait
 * out.
 *
 * Never rejects. The map already in hand still answers, and the fetcher records
 * the failure on its own snapshot, so a best-effort accuracy fix must not fail
 * the read that prompted it.
 *
 * Resolves with the rebuilt map, or `undefined` when there was nothing to fix
 * or the rebuild did not land.
 */
async function repairProjectUserIds(
  instance: SanityInstance,
  users: SanityUser[],
  projectId: string,
  projectUserIdsById: ProjectUserIds,
): Promise<ProjectUserIds | undefined> {
  const state = getRepairState(instance)
  if (state.inFlight.has(projectId)) return undefined

  const unmapped = findUnmappedUsers(users, projectId, projectUserIdsById)
  if (!unmapped.length || unmapped.every((userId) => state.unexplained.has(userId))) {
    return undefined
  }

  state.inFlight.add(projectId)
  try {
    const rebuilt = await projectUserIds.refetch(instance, projectId)
    // A full walk that still owes an id is not going to produce one, so stop
    // asking on this user's behalf.
    for (const userId of unmapped) {
      if (!rebuilt.has(userId)) state.unexplained.add(userId)
    }
    return rebuilt
  } catch {
    return undefined
  } finally {
    state.inFlight.delete(projectId)
  }
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

function toResult(users: UsersState, context?: GrantsContext): UsersWithGrantsResult {
  return {
    data: annotate(users.data, context),
    totalCount: users.totalCount,
    hasMore: users.hasMore,
  }
}

/**
 * Returns the state source for a resource's users, each annotated with whether
 * they hold a grant on a document.
 *
 * Without `document` this is `getUsersState` with every user `granted: true`.
 * With one, it additionally reads the dataset's access groups and the document
 * itself, then evaluates each group's GROQ filters per user. That evaluation is
 * the only way to answer for a user other than the current one: the dataset ACL
 * endpoint answers for the requesting session alone.
 *
 * An organization audience additionally reads the project's user id map, since
 * an organization users read carries no project user id of its own.
 *
 * Note: This functionality is for advanced users who want to build their own framework
 * integrations. Our SDK also provides a React integration for convenient usage.
 *
 * @beta
 */
export function getUsersWithGrantsState(
  instance: SanityInstance,
  options: UsersWithGrantsOptions = {},
): StateSource<UsersWithGrantsResult | undefined> {
  const {document, grant = 'read'} = options
  const usersSource = getUsersState(instance, toUsersOptions(options))
  const resource = document ? resolveGrantsResource(instance, document) : undefined

  const groupsSource = resource ? systemGroups.getState(instance, resource) : undefined
  const documentSource = document
    ? getDocumentState(instance, {...document, path: undefined})
    : undefined
  const idsSource =
    resource && needsProjectUserIds(options)
      ? projectUserIds.getState(instance, resource.projectId)
      : undefined

  const compute = memoizeLast(
    (
      users: UsersState | undefined,
      groups: FetcherSnapshot<SystemGroup[]> | undefined,
      documentValue: SanityDocument | null | undefined,
      ids: FetcherSnapshot<ProjectUserIds> | undefined,
    ): UsersWithGrantsResult | undefined => {
      if (!users) return undefined
      if (!groups || !resource) return toResult(users)

      // Annotating against a half-known set of groups, or before every project
      // user id is in, would report users as having no access when the answer
      // is simply not in yet.
      if (isPending(groups) || isPending(ids) || documentValue === undefined) return undefined

      return toResult(users, {
        groups: groups.data ?? [],
        document: documentValue,
        grant,
        projectId: resource.projectId,
        projectUserIdsById: ids?.data,
      })
    },
  )

  /**
   * Kept out of `compute` so the snapshot stays a pure derivation, and deferred
   * so the refetch's synchronous store update can't re-enter a notification
   * already in progress. A rebuilt map then arrives as an ordinary update that
   * re-runs `compute` with the ids in hand.
   */
  const repairIfNeeded = (): void => {
    const users = usersSource.getCurrent()
    const ids = idsSource?.getCurrent()
    if (!users || !resource || ids?.status !== 'success') return

    queueMicrotask(() => {
      void repairProjectUserIds(instance, users.data, resource.projectId, ids.data)
    })
  }

  return {
    getCurrent: () =>
      compute(
        usersSource.getCurrent(),
        groupsSource?.getCurrent(),
        documentSource?.getCurrent(),
        idsSource?.getCurrent(),
      ),
    subscribe: (onStoreChanged?: () => void) => {
      const handleChange = () => {
        repairIfNeeded()
        onStoreChanged?.()
      }
      const unsubscribers = [
        usersSource.subscribe(handleChange),
        groupsSource?.subscribe(handleChange),
        documentSource?.subscribe(handleChange),
        idsSource?.subscribe(handleChange),
      ]
      repairIfNeeded()
      return () => {
        for (const unsubscribe of unsubscribers) unsubscribe?.()
      }
    },
    observable: combineLatest([
      usersSource.observable,
      groupsSource?.observable ?? of(undefined),
      documentSource?.observable ?? of(undefined),
      idsSource?.observable ?? of(undefined),
    ]).pipe(
      map(([users, groups, documentValue, ids]) => compute(users, groups, documentValue, ids)),
      distinctUntilChanged(),
      shareReplay({bufferSize: 1, refCount: true}),
    ),
  }
}

/**
 * Resolves a resource's users and their grants without registering a lasting
 * subscriber, for use with React Suspense. See `resolveUsers` for the wider
 * contract, including the `signal` behaviour.
 *
 * @beta
 */
export async function resolveUsersWithGrants(
  instance: SanityInstance,
  options: ResolveUsersWithGrantsOptions = {},
): Promise<UsersWithGrantsResult | undefined> {
  const {signal, document, grant = 'read'} = options
  const usersOptions = {...toUsersOptions(options), signal}

  if (!document) {
    const users = await resolveUsers(instance, usersOptions)
    return users && toResult(users)
  }

  const resource = resolveGrantsResource(instance, document)
  const [users, groups, documentValue, projectUserIdsById] = await Promise.all([
    resolveUsers(instance, usersOptions),
    systemGroups.resolveState(instance, resource),
    resolveDocument(instance, document),
    needsProjectUserIds(options)
      ? projectUserIds.resolveState(instance, resource.projectId)
      : undefined,
  ])

  if (!users) return undefined

  const context: GrantsContext = {
    groups,
    document: documentValue,
    grant,
    projectId: resource.projectId,
    projectUserIdsById,
  }
  if (!projectUserIdsById) return toResult(users, context)

  const rebuilt = await repairProjectUserIds(
    instance,
    users.data,
    resource.projectId,
    projectUserIdsById,
  )

  return toResult(users, rebuilt ? {...context, projectUserIdsById: rebuilt} : context)
}

/**
 * Loads the next page of users for the same read. Grants are re-evaluated over
 * the extended list.
 *
 * @beta
 */
export function loadMoreUsersWithGrants(
  instance: SanityInstance,
  options: UsersWithGrantsOptions = {},
): Promise<unknown> {
  return loadMoreUsers(instance, toUsersOptions(options))
}

/** @internal */
export const getUsersWithGrantsKey = (
  instance: SanityInstance,
  options: UsersWithGrantsOptions = {},
): string => {
  const {document, grant = 'read'} = options
  return JSON.stringify({
    users: getUsersKey(instance, toUsersOptions(options)),
    grant,
    // Spelled out field by field so the key doesn't change with the key order
    // of a caller's object literal.
    document: document && {
      documentId: document.documentId,
      documentType: document.documentType,
      projectId: document.projectId,
      dataset: document.dataset,
      resource: document.resource,
      liveEdit: document.liveEdit,
      perspective: document.perspective,
    },
  })
}

/** @internal */
export const parseUsersWithGrantsKey = (key: string): UsersWithGrantsOptions => {
  const {users, grant, document} = JSON.parse(key) as {
    users: string
    grant: Grant
    document?: DocumentHandle
  }
  return {...JSON.parse(users), grant, ...(document && {document})}
}
