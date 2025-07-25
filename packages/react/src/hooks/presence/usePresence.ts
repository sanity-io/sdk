import {getPresence, type UserPresence} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * A hook for subscribing to presence information for the current project.
 * @public
 */
export function usePresence(): {
  locations: UserPresence[]
} {
  const sanityInstance = useSanityInstance()
  const source = useMemo(() => getPresence(sanityInstance), [sanityInstance])
  const subscribe = useCallback((callback: () => void) => source.subscribe(callback), [source])
  const locations = useSyncExternalStore(
    subscribe,
    () => source.getCurrent(),
    () => source.getCurrent(),
  )

  return {locations: locations || []}
}
