import {type DatasetsResponse} from '@sanity/client'
import {
  getDatasetsState,
  type ProjectHandle,
  resolveDatasets,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'
import {identity} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

type UseDatasets = {
  /**
   *
   * Returns metadata for each dataset the current user has access to.
   *
   * @category Datasets
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
   */
  (): DatasetsResponse
}

/**
 * @public
 * @function
 */
export const useDatasets: UseDatasets = createStateSourceHook({
  getState: getDatasetsState as (
    instance: SanityInstance,
    projectHandle?: ProjectHandle,
  ) => StateSource<DatasetsResponse>,
  shouldSuspend: (instance, projectHandle?: ProjectHandle) =>
    // remove `undefined` since we're suspending when that is the case
    getDatasetsState(instance, projectHandle).getCurrent() === undefined,
  suspender: resolveDatasets,
  getConfig: identity as (projectHandle?: ProjectHandle) => ProjectHandle,
})
