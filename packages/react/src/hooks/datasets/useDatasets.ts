import {type DatasetsResponse} from '@sanity/client'
import {getDatasetsState, resolveDatasets, type SanityInstance, type StateSource} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

type UseDatasets = {
  /**
   *
   * Returns metadata for each dataset in your organization.
   *
   * @category Datasets
   * @returns The metadata for your organization's datasets
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

/** @public */
export const useDatasets: UseDatasets = createStateSourceHook({
  // remove `undefined` since we're suspending when that is the case
  getState: getDatasetsState as (instance: SanityInstance) => StateSource<DatasetsResponse>,
  shouldSuspend: (instance) => getDatasetsState(instance).getCurrent() === undefined,
  suspender: resolveDatasets,
})
