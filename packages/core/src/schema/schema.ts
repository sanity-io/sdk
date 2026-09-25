import {switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {
  type DatasetHandle,
  type DatasetResource,
  type DocumentResource,
  isDatasetResource,
} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {defineFetcher} from '../store/fetcherStore'

const API_VERSION = 'vX'

/**
 * Binding bookkeeping for a resource's schema, as opposed to what the schema
 * itself says.
 * @public
 */
export interface SchemaMeta {
  /** The schema's content-hash ID in Lexicon. Matches the unquoted `ETag`. */
  schemaVersion: string
  /** Caller-supplied opaque identifier of the source that last wrote the binding. */
  source: string | null
  /** Caller-supplied plain-text display string for the source. */
  sourceLabel: string | null
  /** The kind of client that last wrote the binding. */
  producer: 'blueprint' | 'studio' | 'mcp' | 'api'
}

/**
 * A resource's schema definition, converted from the descriptor stored in
 * Lexicon, plus the binding's own bookkeeping under `_meta`.
 * @public
 */
export interface SchemaDefinition {
  /** What the resource's binding records about the schema. */
  _meta: SchemaMeta
  /** The schema definition name. */
  name: string
  /** The schema's type definitions in Sanity schema-definition format. */
  types: Record<string, unknown>[]
}

/**
 * Options for reading a dataset's schema. Only dataset resources are
 * supported for now.
 * @public
 */
export type SchemaOptions = DatasetHandle

function getConfiguredResource(
  instance: SanityInstance,
  options?: SchemaOptions,
): DocumentResource | undefined {
  return options?.resource ?? instance.config.resource
}

function getConfiguredDataset(
  instance: SanityInstance,
  options?: SchemaOptions,
): DatasetResource | undefined {
  const projectId = options?.projectId ?? instance.config.projectId
  const dataset = options?.dataset ?? instance.config.dataset
  if (!projectId || !dataset) return undefined
  return {projectId, dataset}
}

function resolveSchemaResource(instance: SanityInstance, options?: SchemaOptions): DatasetResource {
  const resource =
    getConfiguredResource(instance, options) ?? getConfiguredDataset(instance, options)
  if (!resource) {
    throw new Error('A projectId and dataset are required to use the schema API.')
  }
  if (!isDatasetResource(resource)) {
    throw new Error('The schema API is only available for dataset resources.')
  }
  return resource
}

/** @internal */
export function getSchemaCacheKey(instance: SanityInstance, options?: SchemaOptions): string {
  const {projectId, dataset} = resolveSchemaResource(instance, options)
  return `schema:${projectId}.${dataset}`
}

/**
 * Fetcher for a dataset's schema (`GET /schemas/dataset/:resourceId`), on the
 * shared fetcher cache.
 *
 * @internal
 */
export const schema = defineFetcher<[options?: SchemaOptions], SchemaDefinition>({
  name: 'schema',
  getKey: getSchemaCacheKey,
  fetch: (instance) => (options) => {
    const {projectId, dataset} = resolveSchemaResource(instance, options)
    return getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable.pipe(
      switchMap((client) =>
        client.observable.request<SchemaDefinition>({
          url: `/schemas/dataset/${projectId}.${dataset}`,
          tag: 'schemas.get',
        }),
      ),
    )
  },
})
