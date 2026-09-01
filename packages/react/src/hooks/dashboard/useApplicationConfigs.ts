import {useMemo} from 'react'

import {type ApplicationConfig} from '../../dashboard/messageBus/topics'
import {useTopic, type UseTopicOptions, type UseTopicResult} from './useTopic'

/**
 * Returns the application configuration modules available in the dashboard.
 *
 * Pass `{suspend: false}` to receive a pending result instead of suspending.
 * @public
 */
export function useApplicationConfigs<Suspend extends boolean = true>(
  options: UseTopicOptions<Suspend> = {},
): UseTopicResult<ApplicationConfig[], Suspend> {
  const result = useTopic('applications.config', options)
  return useMemo(
    () => (result.isPending ? result : {...result, data: result.data ?? []}),
    [result],
  ) as UseTopicResult<ApplicationConfig[], Suspend>
}
