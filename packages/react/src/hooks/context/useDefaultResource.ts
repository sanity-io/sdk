import {type DocumentResource} from '@sanity/sdk'
import {useContext} from 'react'

import {ResourceContext} from '../../context/DefaultResourceContext'

/**
 * Returns the current {@link DocumentResource} from context.
 *
 * @public
 *
 * @category Platform
 * @returns The resource set by the nearest `ResourceProvider`, or `undefined`
 *
 * @remarks
 * With the flat instance model, nested `ResourceProvider`s override the
 * active resource via React context rather than creating child instances.
 * Use this hook when you need the current project/dataset/resource for a
 * subtree instead of reading from `useSanityInstance().config`.
 *
 * @example Get the current resource
 * ```tsx
 * const resource = useResource()
 * if (resource && 'projectId' in resource) {
 *   console.log(resource.projectId, resource.dataset)
 * }
 * ```
 */
export function useResource(): DocumentResource | undefined {
  return useContext(ResourceContext)
}

/**
 * @deprecated Use {@link useResource} instead.
 */
export const useDefaultResource = useResource
