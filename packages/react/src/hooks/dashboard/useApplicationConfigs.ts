import {type ApplicationConfig} from '@sanity/sdk/dashboard'

import {useTopic} from './useTopic'

// Stable, frozen reference for the cleared/absent case so the return value only changes with the
// topic and callers cannot mutate the shared empty list.
const NO_CONFIGS: readonly ApplicationConfig[] = Object.freeze([])

/**
 * Returns the application configuration modules available in the dashboard.
 *
 * Suspends until the dashboard publishes its application configs; a cleared list is empty.
 *
 * @example
 * ```tsx
 * function Applications() {
 *   const configs = useApplicationConfigs()
 *   return configs.map((config) => <div key={config.moduleId}>{config.appType}</div>)
 * }
 * ```
 *
 * @public
 */
export function useApplicationConfigs(): readonly ApplicationConfig[] {
  return useTopic('applications.config') ?? NO_CONFIGS
}
