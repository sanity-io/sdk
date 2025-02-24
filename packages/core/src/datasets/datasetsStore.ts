import {type DatasetsResponse} from '@sanity/client'

import {createResource} from '../resources/createResource'

/**
 * State tracked by the datasets store
 *
 * @public
 */
export interface DatasetsStoreState {
  /** The list of datasets for the current project */
  datasets: DatasetsResponse
  /** Whether the datasets are currently being fetched */
  isPending: boolean
  /** The error that occurred while fetching the datasets */
  error: Error | null
  /** Whether the datasets have been loaded */
  initialLoadComplete: boolean
}

/**
 * @internal
 */
export const datasetsStore = createResource<DatasetsStoreState>({
  name: 'datasetsStore',
  getInitialState() {
    return {
      datasets: [],
      isPending: false,
      error: null,
      initialLoadComplete: false,
    }
  },
  initialize() {
    return () => {}
  },
})
