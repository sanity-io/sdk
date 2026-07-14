import {type DatasetsResponse} from '@sanity/client'
import {
  getDatasetsState,
  type ProjectHandle,
  resolveDatasets,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'

type UseDatasets = {
  /**
   *
   * Returns metadata for each dataset the current user has access to.
   *
   * @category Datasets
   * @param options - Optional project/resource to read datasets for. Defaults to
   *   the resource named in `ResourceProvider`/`SDKProvider`.
   * @returns The metadata for your the datasets
   *
   * @example
   * ```tsx
   * const datasets = useDatasets()
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
   */
  (options?: ProjectHandle): DatasetsResponse
}

const useDatasetsBase = createStateSourceHook({
  getState: getDatasetsState as (
    instance: SanityInstance,
    projectHandle?: ProjectHandle,
  ) => StateSource<DatasetsResponse>,
  shouldSuspend: (instance, projectHandle?: ProjectHandle) =>
    // remove `undefined` since we're suspending when that is the case
    getDatasetsState(instance, projectHandle).getCurrent() === undefined,
  suspender: resolveDatasets,
})

/**
 * @public
 * @function
 */
export const useDatasets: UseDatasets = (options) => {
  const projectId = useResolvedProjectId(options)
  return useDatasetsBase(projectId ? {...options, projectId} : options)
}
