import {getPresence, isCanvasResource, isMediaLibraryResource, type UserPresence} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {type ResourceHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * A hook for subscribing to presence information for the current project.
 * @public
 */
export function usePresence(options: ResourceHandle = {}): {
  locations: UserPresence[]
} {
  const normalizedOptions = useNormalizedResourceOptions(options)
  const sanityInstance = useSanityInstance()
  trackHookUsage(sanityInstance, 'usePresence')

  // Validate resource type before attempting to create the presence store
  // This provides immediate, clear feedback instead of hanging
  if (normalizedOptions.resource) {
    if (isMediaLibraryResource(normalizedOptions.resource)) {
      throw new Error(
        'usePresence() does not support media library resources. Presence tracking requires a dataset resource. ' +
          'Either remove the resourceName parameter or use a dataset resource instead.',
      )
    }

    if (isCanvasResource(normalizedOptions.resource)) {
      throw new Error(
        'usePresence() does not support canvas resources. Presence tracking requires a dataset resource. ' +
          'Either remove the resourceName parameter or use a dataset resource instead.',
      )
    }
  }

  const source = useMemo(
    () => getPresence(sanityInstance, normalizedOptions),
    [sanityInstance, normalizedOptions],
  )
  const subscribe = useCallback((callback: () => void) => source.subscribe(callback), [source])
  const locations = useSyncExternalStore(
    subscribe,
    () => source.getCurrent(),
    () => source.getCurrent(),
  )

  return {locations: locations || []}
}
