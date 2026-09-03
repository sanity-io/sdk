import {type DocumentResource, type GetUsersOptions, isDatasetResource} from '@sanity/sdk'
import {useContext} from 'react'

import {ProjectContext} from '../../context/ProjectContext'
import {useNormalizedResourceOptions} from './useNormalizedResourceOptions'

/**
 * Resolves the effective `projectId` for project-scoped hooks (`useProject`,
 * `useDatasets`, `useUsers`).
 *
 * Precedence:
 * 1. an explicit `projectId` on the options
 * 2. the ambient project scope (`ProjectContext`, e.g. a dataset-less
 *    `<ResourceProvider projectId="…">`)
 * 3. the resolved resource's projectId (`ResourceProvider`/`SDKProvider`)
 *
 * Returns `undefined` when none apply, letting callers fall back to core's
 * `instance.config.projectId`.
 *
 * @internal
 */
export function useResolvedProjectId(options?: {
  projectId?: string
  dataset?: string
  resource?: DocumentResource
  resourceName?: string
}): string | undefined {
  const {resource} = useNormalizedResourceOptions(options ?? {})
  const contextProjectId = useContext(ProjectContext)
  return (
    options?.projectId ??
    contextProjectId ??
    (resource && isDatasetResource(resource) ? resource.projectId : undefined)
  )
}

/**
 * Injects a resolved `projectId` into project-scoped users options. A missing
 * `projectId` is a no-op, and organization-scoped queries (explicit
 * `resourceType`/`organizationId`) or options that already carry a `projectId`
 * are returned unchanged.
 *
 * @internal
 */
export function withResolvedProjectId<TOptions extends GetUsersOptions>(
  options: TOptions | undefined,
  projectId: string | undefined,
): TOptions | undefined {
  if (!projectId) return options
  if (!options) return {projectId} as TOptions
  const isOrgScoped = options.resourceType === 'organization' || !!options.organizationId
  if (isOrgScoped || options.projectId) return options
  return {...options, projectId}
}
