import {type DocumentSource} from '@sanity/sdk'

/**
 * Option which can be used for deciding which source to traget.
 *
 * This uses the following strategy:
 *
 * 1. If `source` is given it will use this source and ignore the other parameters.
 * 2. If `dataset` or `projectId` is given it will look inside the current Sanity instances for them.
 * 3. Otherwise, it uses the current projectId/dataset on the current Sanity instances.
 */
export type SourceOptions = {
  /**
   * The source (e.g. dataset) which will be queried.
   */
  source?: DocumentSource

  /**
   * Overrides the project ID for this query.
   */
  projectId?: string

  /**
   * Overrides the project ID for this query.
   */
  dataset?: string
}
