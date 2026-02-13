import {observeOrganizationVerificationState, type OrgVerificationResult} from '@sanity/sdk'
import {useEffect, useState} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Hook that verifies the current projects belongs to the organization ID specified in the dashboard context.
 *
 * @public
 * @param disabled - When true, disables verification and skips project verification API calls
 * @returns Error message if the project doesn't match the organization ID, or null if all match or verification isn't needed
 * @category Projects
 * @example
 * ```tsx
 * function OrgVerifier() {
 *   const error = useVerifyOrgProjects()
 *
 *   if (error) {
 *     return <div className="error">{error}</div>
 *   }
 *
 *   return <div>Organization projects verified!</div>
 * }
 * ```
 */
export function useVerifyOrgProjects(disabled = false, projectIds?: string[]): string | null {
  const instance = useSanityInstance()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (disabled || !projectIds || projectIds.length === 0) {
      // Reset to null when verification is inactive. React bails out of the
      // re-render when the value is already null, so this is a no-op in the
      // common case and avoids needing `error` in the dependency array.
      setError(null)
      return
    }

    const verificationObservable$ = observeOrganizationVerificationState(instance, projectIds)

    const subscription = verificationObservable$.subscribe((result: OrgVerificationResult) => {
      setError(result.error)
    })

    return () => {
      subscription.unsubscribe()
    }
    // NOTE: `error` is intentionally excluded — including it caused a
    // subscribe → setError → re-render → resubscribe loop on every emission.
  }, [instance, disabled, projectIds])

  return error
}
