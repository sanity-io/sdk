import {type DocumentResource} from '@sanity/sdk'

import {useEffectiveContextResource} from '../helpers/useNormalizedResourceOptions'

/**
 * Returns the currently active `DocumentResource` for the nearest resource context.
 *
 * Resolves in priority order:
 * 1. A `resource` prop on the nearest `<ResourceProvider>`
 * 2. The `projectId`/`dataset` from the current `SanityInstance` config
 * 3. `undefined` when neither is available
 *
 * @public
 * @category Platform
 *
 * @example
 * ```tsx
 * const resource = useResource()
 * console.log(resource?.projectId, resource?.dataset)
 * ```
 */
export function useResource(): DocumentResource | undefined {
  return useEffectiveContextResource()
}
