import {type TopicData} from '@sanity/sdk/dashboard'

import {useTopic} from './useTopic'

/**
 * Returns the base path for an application.
 *
 * Suspends until Dashboard publishes the path and throws a `TopicError` when the application is
 * unknown.
 *
 * @example
 * ```tsx
 * function ApplicationBasePath() {
 *   const basePath = useApplicationBasePath()
 *   return <span>{basePath}</span>
 * }
 * ```
 *
 * @public
 */
export function useApplicationBasePath(): TopicData<'applications.base-path'> {
  return useTopic('applications.base-path')
}
