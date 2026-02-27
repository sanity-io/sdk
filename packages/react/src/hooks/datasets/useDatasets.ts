import {type DatasetsResponse} from '@sanity/client'
import {getDatasetsState, resolveDatasets, type SanityInstance, type StateSource} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

type UseDatasets = {
  /**
   *
   * Returns metadata for each dataset the current user has access to.
   *
   * @category Datasets
   * @param options - An object containing the `projectId` to list datasets for.
   * @returns The metadata for the datasets
   *
   * @example
   * ```tsx
   * const datasets = useDatasets({projectId: 'my-project-id'})
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
  (options: {projectId: string}): DatasetsResponse
}

/**
 * @public
 * @function
 */
export const useDatasets: UseDatasets = createStateSourceHook({
  getState: getDatasetsState as (
    instance: SanityInstance,
    options: {projectId: string},
  ) => StateSource<DatasetsResponse>,
  shouldSuspend: (instance, options: {projectId: string}) =>
    getDatasetsState(instance, options).getCurrent() === undefined,
  suspender: resolveDatasets,
})
