import {type DashboardApplication, useApplications} from './useApplications'

/**
 * Returns a dashboard application by id or slug, or `null` when it is unavailable.
 *
 * Suspends until the dashboard publishes its application list. A slug is unique only within an
 * organization, so when several entries match, the first listed wins.
 *
 * @example
 * ```tsx
 * function SelectedApplication({id}: {id: string}) {
 *   const application = useApplication(id)
 *   return application ? <h1>{application.title}</h1> : <p>Application unavailable</p>
 * }
 * ```
 *
 * @public
 * @category Dashboard
 */
export function useApplication(applicationIdOrSlug: string): DashboardApplication | null {
  return (
    useApplications().find(
      ({id, slug}) => id === applicationIdOrSlug || slug === applicationIdOrSlug,
    ) ?? null
  )
}
