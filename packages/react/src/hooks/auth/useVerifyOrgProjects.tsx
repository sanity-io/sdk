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
  if (error) {
    console.error('AHHH', error)
    throw error
  }

  useEffect(() => {
    if (disabled || !projectIds || projectIds.length === 0) {
      if (error !== null) setError(null)
      return
    }

    const verificationObservable$ = observeOrganizationVerificationState(instance, projectIds)

    const subscription = verificationObservable$.subscribe({
      next: (result: OrgVerificationResult) => {
        setError(result.error)
      },
      error: setError,
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [instance, disabled, error, projectIds])

  return error
}
