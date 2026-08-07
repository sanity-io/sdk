import {getPresence, isMediaLibraryResource, type UserPresence} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {type ResourceHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * Every participant in the current project and dataset, or Canvas.
 *
 * Reading presence never announces anything. Call `useReportPresence` to make the
 * current user visible to others, including to the Studio, which shares the same
 * presence room.
 *
 * This returns everyone in the whole resource and leaves the filtering to you.
 * Prefer `usePresenceForDocument` when you care about one document: it scopes and
 * flattens the result for rendering. Note that participants are counted by session,
 * so one person in two tabs appears twice.
 *
 * Presence is scoped to a single project and dataset. It is not a list of everyone
 * signed in to your organization.
 *
 * @public
 */
export function usePresence(options: ResourceHandle = {}): {
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
