// TODO: Uncomment and use these imports in your implementation
// import {getPresenceLocations, type PresenceLocation, reportPresence} from '@sanity/sdk'
// import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {type PresenceLocation} from '@sanity/sdk'

// TODO: Uncomment and use this import in your implementation
// import {useSanityInstance} from '../context/useSanityInstance'

/**
 * A hook for subscribing to presence information for the current project.
 * @public
 *
 * TODO: Complete this hook to manage presence functionality
 *
 * Implementation needs:
 * - Subscribe to presence locations using getPresenceLocations
 * - Use React's useSyncExternalStore for concurrent-safe subscriptions
 * - Provide a function to report presence updates
 * - Optimize with proper React hooks patterns
 *
 * Available functions: getPresenceLocations, reportPresence, useSanityInstance
 */
export function usePresence(): {
  locations: PresenceLocation[]
  reportPresence: (locations: PresenceLocation[]) => void
} {
  // TODO: Implement the hook logic here
  throw new Error('usePresence hook not yet implemented')
}
