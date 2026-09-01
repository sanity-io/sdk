import {type Application} from '@sanity/sdk'
import {useMemo} from 'react'

import {
  type ApplicationConfig,
  type ApplicationConfigAppType,
} from '../../dashboard/messageBus/topics'
import {useApplicationConfigs} from './useApplicationConfigs'
import {type UseTopicOptions, type UseTopicResult} from './useTopic'

/**
 * Selects an application configuration by application id or application type.
 * @public
 */
export type ApplicationConfigSelector =
  | {appId: Application['id']; appType?: never}
  | {appId?: never; appType: ApplicationConfigAppType}

/**
 * Returns an application configuration by application id or application type.
 *
 * Pass `{suspend: false}` to receive a pending result instead of suspending.
 * @public
 */
export function useApplicationConfig<Suspend extends boolean = true>(
  selector: ApplicationConfigSelector,
  options: UseTopicOptions<Suspend> = {},
): UseTopicResult<ApplicationConfig | null, Suspend> {
  const result = useApplicationConfigs(options)
  return useMemo(
    () =>
      result.isPending
        ? result
        : {
            data:
              result.data.find((config) =>
                selector.appId === undefined
                  ? config.appType === selector.appType
                  : config.appId === selector.appId,
              ) ?? null,
            isPending: false,
          },
    [result, selector.appId, selector.appType],
  ) as UseTopicResult<ApplicationConfig | null, Suspend>
}
