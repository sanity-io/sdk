import {type Application} from '@sanity/sdk'

import {useTopic} from './useTopic'

/**
 * Returns the id of the application in the foreground, or `null` when Dashboard has none.
 *
 * Suspends until Dashboard publishes the foreground application.
 *
 * @example
 * ```tsx
 * function ForegroundApplication() {
 *   const foregroundId = useApplicationForegroundId()
 *   return <span>{foregroundId ?? 'No foreground application'}</span>
 * }
 * ```
 *
 * @public
 */
export function useApplicationForegroundId(): Application['id'] | null {
  return useTopic('applications.foreground')
}
