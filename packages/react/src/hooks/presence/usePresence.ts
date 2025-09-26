import {getPresence, type UserPresence} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstanceAndSource} from '../context/useSanityInstance'

/**
 * A hook for subscribing to presence information for the current project.
 * @public
 */
export function usePresence(): {
  locations: UserPresence[]
} {
  const [sanityInstance, actualSource] = useSanityInstanceAndSource({})
  const source = useMemo(
    () => getPresence(sanityInstance, {source: actualSource}),
    [sanityInstance, actualSource],
  )
  const subscribe = useCallback((callback: () => void) => source.subscribe(callback), [source])
  const locations = useSyncExternalStore(
    subscribe,
    () => source.getCurrent(),
    () => source.getCurrent(),
  )

  return {locations: locations || []}
}
