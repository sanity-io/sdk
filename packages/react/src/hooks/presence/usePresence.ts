import {
  type DocumentSource,
  getPresence,
  isCanvasSource,
  isMediaLibrarySource,
  type UserPresence,
} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {
  useNormalizedSourceOptions,
  type WithSourceNameSupport,
} from '../helpers/useNormalizedSourceOptions'

type UsePresenceOptions = WithSourceNameSupport<{source?: DocumentSource}>
/**
 * A hook for subscribing to presence information for the current project.
 * @public
 */
export function usePresence(options: UsePresenceOptions = {}): {
  locations: UserPresence[]
} {
  const normalizedOptions = useNormalizedSourceOptions(options)
  const sanityInstance = useSanityInstance()

  // Validate source type before attempting to create the presence store
  // This provides immediate, clear feedback instead of hanging
  if (normalizedOptions.source) {
    if (isMediaLibrarySource(normalizedOptions.source)) {
      throw new Error(
        'usePresence() does not support media library sources. Presence tracking requires a dataset source. ' +
          'Either remove the sourceName parameter or use a dataset source instead.',
      )
    }

    if (isCanvasSource(normalizedOptions.source)) {
      throw new Error(
        'usePresence() does not support canvas sources. Presence tracking requires a dataset source. ' +
          'Either remove the sourceName parameter or use a dataset source instead.',
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
