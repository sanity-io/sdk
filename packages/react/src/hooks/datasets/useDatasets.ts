import {type DatasetsResponse} from '@sanity/client'
import {getDatasets, getDatasetsState} from '@sanity/sdk'
import {useCallback, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 *
 * React hook that provides access to Sanity datasets associated with the current instance.
 *
 * This hook implements a stale-while-revalidate caching strategy and integrates with React Suspense
 * for loading states. It will automatically fetch datasets when mounted and keep the data in sync
 * with the server.
 *
 * @throws Promise when datasets are being loaded initially, throws a promise for React Suspense
 *
 * @returns A list of datasets for the current project
 *
 * @example
 * ```tsx
 * // Basic usage
 * function DatasetList() {
 *   const datasets = useDatasets()
 *
 *   return (
 *     <ul>
 *       {datasets.map((dataset) => (
 *         <li key={dataset.name}>{dataset.name}</li>
 *       ))}
 *     </ul>
 *   )
 * }
 *
 * // Usage with Suspense
 * function App() {
 *   return (
 *     <Suspense fallback={<div>Loading datasets...</div>}>
 *       <DatasetList />
 *     </Suspense>
 *   )
 * }
 * ```
 *
 *  @remarks
 * - Initial data fetching will trigger React Suspense
 * - Subsequent updates will happen in the background without triggering Suspense
 * - If an error occurs during background revalidation, it will be handled internally
 */
export function useDatasets(): DatasetsResponse {
  const instance = useSanityInstance()
  const {subscribe} = getDatasetsState(instance)

  const getSnapshot = useCallback(() => {
    const currentState = getDatasetsState(instance)

    // If don't have data yet, throw an error to trigger a refetch
    if (!currentState.initialLoadComplete || currentState.isPending) {
      throw getDatasets(instance)
    }

    return currentState.datasets
  }, [instance])

  return useSyncExternalStore(subscribe, getSnapshot)
}
