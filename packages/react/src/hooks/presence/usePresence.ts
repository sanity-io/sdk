import {getPresenceState, isMediaLibraryResource, type UserPresence} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {type ResourceHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * A hook for subscribing to presence information for the current project or Canvas.
 * @public
 */
export function usePresence(options: ResourceHandle = {}): {
  locations: UserPresence[]
} {
  const normalizedOptions = useNormalizedResourceOptions(options)
  if (isMediaLibraryResource(normalizedOptions.resource)) {
    throw new Error(
      'usePresence() does not support media library resources. Presence tracking requires a canvas or dataset resource.',
    )
  }

  const sanityInstance = useSanityInstance()
  trackHookUsage(sanityInstance, 'usePresence')
  const source = useMemo(
    () => getPresenceState(sanityInstance, normalizedOptions),
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
