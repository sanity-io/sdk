import {type DashboardApplication, useApplications} from './useApplications'

/**
 * Returns a dashboard application by id or slug, or `null` when it is unavailable.
 *
 * Suspends until the dashboard publishes its application list. An id match wins over a slug match.
 * A slug is unique only within an organization, so when several entries share it, the first listed
 * wins.
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
  const applications = useApplications()

  return (
    applications.find(({id}) => id === applicationIdOrSlug) ??
    applications.find(({slug}) => slug === applicationIdOrSlug) ??
    null
  )
}
