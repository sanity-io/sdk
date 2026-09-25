import {isDatasetResource, schema, type SchemaDefinition, type SchemaOptions} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'
import {
  useNormalizedResourceOptions,
  type WithResourceNameSupport,
} from '../helpers/useNormalizedResourceOptions'

const useSchemaBase = createFetcherHook(schema)

/**
 * Returns the schema definition for a dataset resource.
 *
 * @category Schema
 * @param options - Optional dataset/resource to read the schema for. Defaults
 *   to the resource named in `ResourceProvider`/`SDKProvider`.
 * @returns A {@link FetcherHookResult} whose `data` is the dataset's schema
 *   definition.
 *
 * @example
 * ```tsx
 * function SchemaInspector() {
 *   const {data: schema} = useSchema()
 *
 *   return <pre>{JSON.stringify(schema.types, null, 2)}</pre>
 * }
 * ```
 *
 * @remarks
 * Only dataset resources (a `projectId` and `dataset` pair) are supported for
 * now. Reads for media-library or canvas resources throw an error.
 * @public
 * @function
 */
export function useSchema(
  options?: WithResourceNameSupport<SchemaOptions>,
): FetcherHookResult<SchemaDefinition> {
  const normalizedOptions = useNormalizedResourceOptions(options ?? {})
  if (normalizedOptions.resource && !isDatasetResource(normalizedOptions.resource)) {
    throw new Error('The schema API is only available for dataset resources.')
  }
  return useSchemaBase(normalizedOptions)
}
