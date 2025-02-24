import {type DatasetsResponse} from '@sanity/client'

import {getClient} from '../../client/actions/getClient'
import {createAction} from '../../resources/createAction'
import {datasetsStore} from '../datasetsStore'

const API_VERSION = 'v2025-02-24'

/**
 * Gets a list of datasets for the current project.
 *
 * This action manages the loading state and caching of datasets in the datasets store.
 * It will return cached datasets unless a force refresh is requested or no datasets
 * are currently loaded.
 *
 * @public
 *
 * @param forceRefetch - If `true`, the datasets will be fetched from the server even if they are already cached.
 * @returns A promise that resolves to a list of datasets.
 *
 * @example
 * ```typescript
 * // Get datasets from cache (if available)
 * const datasets = await getDatasets()
 *
 * // Force a fresh fetch from the API
 * const freshDatasets = await getDatasets(true)
 *
 * // Example dataset response
 * const datasets = [{
 *   name: 'My Dataset',
 *   aclMode: 'public',
 * }]
 * ```
 */
export const getDatasets = createAction(
  datasetsStore,
  ({state, instance}) =>
    async (forceRefetch = false): Promise<DatasetsResponse> => {
      const {datasets, isPending, initialLoadComplete} = state.get()

      // If we're not forcing a refetch and the datasets are already loaded, return the cached datasets
      if (!forceRefetch && !isPending && initialLoadComplete) {
        return datasets
      }

      try {
        const client = getClient(instance, {
          apiVersion: API_VERSION,
        })
        const datasetsResponse = await client.datasets.list()

        state.set('datasetsLoaded', {
          datasets: datasetsResponse,
          isPending: false,
          initialLoadComplete: true,
        })

        return datasetsResponse
      } catch (error) {
        // Update error state
        state.set('datasetsRequested', {
          ...state.get(),
          isPending: false,
          error: error as Error,
          initialLoadComplete: initialLoadComplete || false,
        })
        throw error
      }
    },
)
