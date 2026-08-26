import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ProjectHandle} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {createFetcherStore} from '../utils/createFetcherStore'

const API_VERSION = 'v2025-02-19'

/** @public */
export interface ProjectMemberRole {
  name: string
  title: string
  description: string
}

/** @public */
export interface ProjectMember {
  id: string
  createdAt: string
  updatedAt: string
  isCurrentUser: boolean
  isRobot: boolean
  roles: ProjectMemberRole[]
}

/** @public */
export interface ProjectMetadata {
  color?: string
  externalStudioHost?: string
  initialTemplate?: string
  cliInitializedAt?: string
  integration: 'manage' | 'cli'
}

/**
 * The base fields returned from `/projects` for every project.
 * @public
 */
export interface ProjectBase {
  id: string
  displayName: string
  studioHost: string | null
  organizationId: string
  metadata: ProjectMetadata
  isBlocked: boolean
  isDisabled: boolean
  isDisabledByUser: boolean
  activityFeedEnabled: boolean
  createdAt: string
  updatedAt: string
}

/**
 * A `Project` with `members` and/or `features` conditionally included
 * based on the query options used to fetch it.
 * @public
 */
export type Project<
  IncludeMembers extends boolean = true,
  IncludeFeatures extends boolean = true,
> = ProjectBase &
  // `boolean extends T` is non-distributive — true only when T is the wide
  // `boolean`, in which case the field is optional. Literal `true`/`false`
  // fall through to the strict branch.
  (boolean extends IncludeMembers
    ? {members?: ProjectMember[]}
    : IncludeMembers extends true
      ? {members: ProjectMember[]}
      : unknown) &
  (boolean extends IncludeFeatures
    ? {features?: string[]}
    : IncludeFeatures extends true
      ? {features: string[]}
      : unknown)

/** @public */
export interface ProjectOptions<
  IncludeMembers extends boolean = true,
  IncludeFeatures extends boolean = true,
> extends ProjectHandle {
  includeMembers?: IncludeMembers
  includeFeatures?: IncludeFeatures
}

function normalizeProjectOptions(options?: ProjectOptions<boolean, boolean>) {
  return {
    includeMembers: options?.includeMembers ?? true,
    includeFeatures: options?.includeFeatures ?? true,
  }
}

function resolveProjectId(instance: SanityInstance, options?: ProjectOptions<boolean, boolean>) {
  const projectId = options?.projectId ?? instance.config.projectId
  if (!projectId) {
    throw new Error('A projectId is required to use the project API.')
  }
  return projectId
}

/** @internal */
export function getProjectCacheKey(
  instance: SanityInstance,
  options?: ProjectOptions<boolean, boolean>,
): string {
  const projectId = resolveProjectId(instance, options)
  const {includeMembers, includeFeatures} = normalizeProjectOptions(options)
  const membersKey = includeMembers ? ':members' : ''
  const featuresKey = includeFeatures ? ':features' : ''
  return `project:${projectId}${membersKey}${featuresKey}`
}

const project = createFetcherStore({
  name: 'Project',
  getKey: getProjectCacheKey,
  fetcher: (instance) => (options?: ProjectOptions<boolean, boolean>) => {
    const projectId = resolveProjectId(instance, options)

    return getClientState(instance, {
      apiVersion: API_VERSION,
      scope: 'global',
    }).observable.pipe(
      switchMap((client) => {
        const normalized = normalizeProjectOptions(options)
        const query = Object.fromEntries(
          Object.entries(normalized)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        )

        return client.observable.request({
          uri: `/projects/${projectId}`,
          query,
          tag: 'project.get',
        })
      }),
    )
  },
})

/**
 * Public signature for the project state source. The conditional generics
 * cannot flow through `BoundStoreAction`, so we declare the signature here
 * and assign the (already-correct) runtime function to it.
 */
type GetProjectState = <
  IncludeMembers extends boolean = true,
  IncludeFeatures extends boolean = true,
>(
  instance: SanityInstance,
  options?: ProjectOptions<IncludeMembers, IncludeFeatures>,
) => StateSource<Project<IncludeMembers, IncludeFeatures> | undefined>

type ResolveProject = <
  IncludeMembers extends boolean = true,
  IncludeFeatures extends boolean = true,
>(
  instance: SanityInstance,
  options?: ProjectOptions<IncludeMembers, IncludeFeatures>,
) => Promise<Project<IncludeMembers, IncludeFeatures>>

/** @public */
export const getProjectState: GetProjectState = project.getState

/** @public */
export const resolveProject: ResolveProject = project.resolveState
