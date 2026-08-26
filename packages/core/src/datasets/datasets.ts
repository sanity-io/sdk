import {type DatasetsResponse} from '@sanity/client'
import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ProjectHandle} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher} from '../store/fetcherStore'

const API_VERSION = 'v2025-02-19'

function resolveProjectId(instance: SanityInstance, options?: ProjectHandle): string {
  const projectId = options?.projectId ?? instance.config.projectId
  if (!projectId) {
    throw new Error('A projectId is required to use the datasets API.')
  }
  return projectId
}

/**
 * Fetcher for a project's datasets (`GET /datasets`), on the shared fetcher
 * cache.
 *
 * @internal
 */
export const datasets = defineFetcher<[options?: ProjectHandle], DatasetsResponse>({
  name: 'datasets',
  getKey: resolveProjectId,
  fetch: (instance) => (options) =>
    getClientState(instance, {
      apiVersion: API_VERSION,
      projectId: resolveProjectId(instance, options),
      useProjectHostname: true,
    }).observable.pipe(switchMap((client) => client.observable.datasets.list())),
})
