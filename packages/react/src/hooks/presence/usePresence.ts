import {
  type DatasetHandle,
  getPresence,
  isMediaLibraryResource,
  type UserPresence,
} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {
  useNormalizedResourceOptions,
  type WithResourceNameSupport,
} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * A hook for subscribing to presence information for the current project or Canvas.
 * @public
 */
export function usePresence(options: WithResourceNameSupport<DatasetHandle> = {}): {
  locations: UserPresence[]
} {
  const normalizedOptions = useNormalizedResourceOptions(options)
  if (normalizedOptions.resource && isMediaLibraryResource(normalizedOptions.resource)) {
    throw new Error(
      'usePresence() does not support media library resources. Presence tracking requires a canvas or dataset resource.',
    )
  }

  const sanityInstance = useSanityInstance()
  trackHookUsage(sanityInstance, 'usePresence')
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
