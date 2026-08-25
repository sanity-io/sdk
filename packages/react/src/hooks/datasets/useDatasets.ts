import {type DatasetsResponse} from '@sanity/client'
import {datasets, type ProjectHandle} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'

const useDatasetsBase = createFetcherHook(datasets)

/**
 * Returns metadata for each dataset the current user has access to.
 *
 * @category Datasets
 * @param options - Optional project/resource to read datasets for. Defaults to
 *   the resource named in `ResourceProvider`/`SDKProvider`.
 * @returns A {@link FetcherHookResult} whose `data` is the metadata for the
 *   datasets.
 *
 * @example
 * ```tsx
 * const {data: datasets} = useDatasets()
 *
 * return (
 *   <select>
 *     {datasets.map((dataset) => (
 *       <option key={dataset.name}>{dataset.name}</option>
 *     ))}
 *   </select>
 * )
 * ```
 *
 * @remarks
 * The `projectId` is resolved in order from:
 * 1. an explicit `projectId` option
 * 2. A legacy ProjectContext (e.g. a `<ResourceProvider projectId="…">` with no dataset), then
 * 3. The active resource (`ResourceProvider`/`SDKProvider`)
 * 4. `instance.config`.
 * @public
 */
export function useDatasets(options?: ProjectHandle): FetcherHookResult<DatasetsResponse> {
  const projectId = useResolvedProjectId(options)
  return useDatasetsBase(projectId ? {...options, projectId} : options)
}
