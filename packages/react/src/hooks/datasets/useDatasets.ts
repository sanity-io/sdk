import {type DatasetsResponse} from '@sanity/client'
import {
  getDatasetsState,
  type ProjectHandle,
  resolveDatasets,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 *
 * Returns metadata for each dataset in your a project.
 *
 * @category Datasets
 * @returns The metadata for your project's datasets
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
 * @public
 */
export const useDatasets = createStateSourceHook({
  getState: getDatasetsState as (
    instance: SanityInstance,
    projectHandle?: ProjectHandle,
  ) => StateSource<DatasetsResponse>,
  shouldSuspend: (instance, projectHandle?: ProjectHandle) =>
    // remove `undefined` since we're suspending when that is the case
    getDatasetsState(instance, projectHandle).getCurrent() === undefined,
  suspender: resolveDatasets,
  getConfig: (projectHandle?: ProjectHandle) => projectHandle,
})
