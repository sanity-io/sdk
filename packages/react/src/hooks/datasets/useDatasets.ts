import {type DatasetsResponse} from '@sanity/client'
import {getDatasetsState} from '@sanity/sdk'
import {useMemo} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useStoreState} from '../helpers/useStoreState'

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
export const useDatasets: UseDatasets = () => {
  const instance = useSanityInstance()
  const {projectId} = instance.config
  if (!projectId) throw new Error('useDatasets must be configured with projectId')
  const state = useMemo(() => getDatasetsState(instance, {projectId}), [instance, projectId])
  return useStoreState(state)
}
