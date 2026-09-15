import {type Application} from '@sanity/sdk'
import {type ApplicationConfig, type ApplicationConfigAppType} from '@sanity/sdk/dashboard'

import {useApplicationConfigs} from './useApplicationConfigs'

/**
 * Selects an application configuration by application id or application type.
 * @public
 */
export type ApplicationConfigSelector =
  | {appId: Application['id']; appType?: never}
  | {appId?: never; appType: ApplicationConfigAppType}

/**
 * Returns an application configuration by application id or application type, or `null` when
 * none matches.
 *
 * An `appType` query matches the type-level config only (the one without an `appId`), so it is
 * independent of the order the dashboard published configs in. An `appId` query matches that
 * application's config.
 *
 * Suspends until the dashboard publishes its application configs.
 *
 * @example
 * ```tsx
 * function MediaLibraryConfig() {
 *   const config = useApplicationConfig({appType: 'media-library'})
 *   return config ? <span>{config.moduleId}</span> : <p>Not installed</p>
 * }
 * ```
 *
 * @public
 */
export function useApplicationConfig(
  selector: ApplicationConfigSelector,
): ApplicationConfig | null {
  const configs = useApplicationConfigs()
  return (
    configs.find((config) =>
      selector.appId === undefined
        ? config.appType === selector.appType && config.appId === undefined
        : config.appId === selector.appId,
    ) ?? null
  )
}
