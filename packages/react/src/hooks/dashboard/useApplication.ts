import {type Application, useApplications} from './useApplications'

/**
 * Returns a dashboard application by id, or `null` when it is unavailable.
 *
 * Suspends until the dashboard publishes its application list.
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
 */
export function useApplication(applicationId: Application['id']): Application | null {
  return useApplications().find(({id}) => id === applicationId) ?? null
}
