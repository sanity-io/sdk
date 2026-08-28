import {type Application} from '@sanity/sdk'

import {useTopic} from './useTopic'

/**
 * Returns the id of the application in the foreground.
 * @public
 */
export function useApplicationForegroundId(): Application['id'] | null {
  return useTopic('applications.foreground') ?? null
}
