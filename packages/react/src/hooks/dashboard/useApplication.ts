import {useMemo} from 'react'

import {type Application, useApplications} from './useApplications'
import {type TopicError, type UseTopicOptions, type UseTopicResult} from './useTopic'

/**
 * Returns a dashboard application by id, or `null` when it is unavailable.
 *
 * Pass `{suspend: false}` to receive a pending result instead of suspending.
 * @public
 */
export function useApplication<Suspend extends boolean = true>(
  applicationId: Application['id'],
  options: UseTopicOptions<Suspend> = {},
): UseTopicResult<Application | null, Suspend, TopicError> {
  const result = useApplications(options)
  return useMemo(
    () =>
      result.isPending || result.error
        ? result
        : {
            data: result.data.find(({id}) => id === applicationId) ?? null,
            isPending: false,
          },
    [applicationId, result],
  ) as UseTopicResult<Application | null, Suspend, TopicError>
}
