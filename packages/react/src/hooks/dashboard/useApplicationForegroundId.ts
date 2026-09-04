import {type Application} from '@sanity/sdk'

import {useTopic, type UseTopicOptions, type UseTopicResult} from './useTopic'

/**
 * Returns the id of the application in the foreground.
 *
 * Pass `{suspend: false}` to receive a pending result instead of suspending.
 * @public
 */
export function useApplicationForegroundId<Suspend extends boolean = true>(
  options: UseTopicOptions<Suspend> = {},
): UseTopicResult<Application['id'] | null, Suspend> {
  return useTopic('applications.foreground', options)
}
