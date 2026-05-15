import {type Action, type ActionsResult, applyDocumentActions} from '@sanity/sdk'
import {isDeepEqual} from '@sanity/sdk/_internal'
import {useContext} from 'react'

import {type ResourceHandle} from '../../config/handles'
import {ResourcesContext} from '../../context/ResourcesContext'
import {useSanityInstance} from '../context/useSanityInstance'
import {normalizeResourceOptions, useEffectiveContextResource} from './useNormalizedResourceOptions'

/**
 * @internal
 *
 * Shared implementation behind `useApplyDocumentActions` and
 * `useApplyReleaseActions`. Resolves the effective resource from the action
 * handles, top-level `options`, or context (in that order), validates that
 * everything agrees on a single resource, and forwards to
 * `applyDocumentActions`.
 *
 * The two public hooks differ only in their input/output types — at runtime
 * they're identical because core's `applyDocumentActions` accepts the full
 * `Action` union.
 */
export function useApplyActions(): (
  actionOrActions: Action | Action[],
  options?: ResourceHandle,
) => Promise<ActionsResult> {
  const instance = useSanityInstance()
  const resources = useContext(ResourcesContext)
  const effectiveContextResource = useEffectiveContextResource()

  return (actionOrActions, options) => {
    const actions = Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions]
    const optionsResource = options
      ? normalizeResourceOptions(options, resources, effectiveContextResource).resource
      : undefined

    const normalizedActions = actions.map((action) =>
      normalizeResourceOptions(action, resources, effectiveContextResource),
    )

    let resource
    for (const action of normalizedActions) {
      const actionResource = action['resource']
      if (!resource && actionResource) resource = actionResource
      if (!isDeepEqual(actionResource, resource)) {
        throw new Error(
          `Mismatched resources found in actions. All actions must belong to the same resource. Found "${JSON.stringify(actionResource)}" but expected "${JSON.stringify(resource)}".`,
        )
      }
    }

    if (optionsResource && resource && !isDeepEqual(optionsResource, resource)) {
      throw new Error(
        `Mismatched resources found in actions. Found top-level resource "${JSON.stringify(optionsResource)}" but expected resource from action handles "${JSON.stringify(resource)}".`,
      )
    }

    const effectiveResource = resource ?? optionsResource ?? effectiveContextResource
    if (!effectiveResource) {
      throw new Error('No resource found. Provide a resource via the action handle or context.')
    }

    return applyDocumentActions(instance, {
      actions: normalizedActions as Action[],
      resource: effectiveResource,
    })
  }
}
