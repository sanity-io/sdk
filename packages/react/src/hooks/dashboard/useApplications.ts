import {toDashboardApplications} from '@sanity/sdk/_internal'
import {type DashboardApplication} from '@sanity/sdk/dashboard'
import {useMemo} from 'react'

import {useTopic} from './useTopic'

/**
 * Returns the applications and installations available in the dashboard, in one consistent shape.
 *
 * Suspends until the dashboard publishes its list; a cleared list is empty. Throws a `TopicError`
 * to the nearest error boundary when the dashboard fails to load. Every entry exposes the same base
 * fields plus `views` and `webWorkers`; `type` distinguishes applications (`'studio' | 'coreApp'`)
 * from installations (`'installation'`), which also carry the raw record under `installation`.
 * `isLocal` marks applications served by a CLI dev server.
 *
 * @example
 * ```tsx
 * function Applications() {
 *   const applications = useApplications()
 *   return applications.map((application) => <div key={application.id}>{application.title}</div>)
 * }
 * ```
 *
 * @beta
 * @category Dashboard
 */
export function useApplications(): DashboardApplication[] {
  const applications = useTopic('applications.list')
  return useMemo(() => (applications ? toDashboardApplications(applications) : []), [applications])
}
