import {type CurrentUser} from '@sanity/sdk'
import {
  getSignInMethodLabel,
  isDashboardEnvironment,
  isStudioConfig,
  type ProjectAccessErrorDetails,
} from '@sanity/sdk/_internal'
import {Suspense, useCallback} from 'react'

import {useCurrentUser} from '../../hooks/auth/useCurrentUser'
import {useLogOut} from '../../hooks/auth/useLogOut'
import {useSanityInstance} from '../../hooks/context/useSanityInstance'
import {Error} from '../errors/Error'
import styles from '../errors/Error.styles'
import {DashboardAccessRequest} from './DashboardAccessRequest'

function describeSignedInAccount(user: CurrentUser | null, project: string): string {
  if (!user) return `The account you're signed in with isn't a member of ${project}.`

  const identity = [user.name, user.email && `(${user.email})`].filter(Boolean).join(' ')
  const providerLabel = getSignInMethodLabel(user.provider)
  const method = providerLabel ? ` with ${providerLabel}` : ''
  return `You're signed in as ${identity}${method}. This account isn't a member of ${project}.`
}

function getSupportDetails(projectId: string | undefined, details: ProjectAccessErrorDetails) {
  return [
    ['Project ID', projectId],
    ['User ID', details.userId],
    ['Trace ID', details.traceId],
  ].filter((entry): entry is [string, string] => !!entry[1])
}

interface ProjectAccessErrorProps {
  details: ProjectAccessErrorDetails
  resetErrorBoundary: () => void
}

/**
 * Explains a `projectUserNotFoundError`: the signed-in account isn't a member
 * of the project.
 *
 * @remarks
 * The screen only shows facts about the signed-in account and the IDs already
 * in the API response. It never says whether another account with the same
 * email exists or has access. An email address doesn't prove that one person
 * owns both accounts: SSO providers assert the address, so an admin of one
 * organization could create an account with someone else's email and use
 * such a hint to learn which projects that person belongs to.
 *
 * @internal
 */
export function ProjectAccessError({
  details,
  resetErrorBoundary,
}: ProjectAccessErrorProps): React.ReactNode {
  const currentUser = useCurrentUser()
  const logout = useLogOut()
  const instance = useSanityInstance()
  const isInDashboard = isDashboardEnvironment(instance)
  // The API names the project it rejected, which can differ from the
  // configured one in apps that read from several projects.
  const projectId = details.projectId ?? instance.config.projectId
  const supportDetails = getSupportDetails(projectId, details)

  const handleSignOut = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  // Signing out only helps when the SDK owns the session. The dashboard and
  // Studio own theirs, and a static token survives logout.
  const onSignOut =
    isInDashboard || isStudioConfig(instance.config) || instance.config.auth?.token
      ? undefined
      : handleSignOut

  return (
    <>
      {/*
       * The dashboard access request flow relies on a comlink connection to
       * the parent window. In standalone apps that connection never
       * materializes, so we must skip it entirely to avoid suspending forever
       * on the parent's Suspense boundary.
       */}
      {isInDashboard && projectId && (
        <Suspense fallback={null}>
          <DashboardAccessRequest projectId={projectId} />
        </Suspense>
      )}
      <Error
        heading="You don't have access to this project"
        cta={onSignOut ? {text: 'Sign out and switch account', onClick: onSignOut} : undefined}
      >
        <p style={styles['paragraph']}>
          {describeSignedInAccount(
            currentUser,
            projectId ? `project ${projectId}` : 'this project',
          )}
        </p>
        <p style={styles['paragraph']}>
          Sanity creates a separate account for each sign-in method, even when they use the same
          email address. If you also sign in another way, such as SSO, Google, GitHub, or email and
          password, that account might be the one with access.
        </p>
        <p style={styles['paragraph']}>
          {onSignOut
            ? 'Sign out and sign in again with that method, or ask a project administrator to add this account.'
            : 'To use another account, sign out of Sanity and sign in again with the method that has access.'}
        </p>
        {supportDetails.length > 0 && (
          <details>
            <summary>Details for support</summary>
            {supportDetails.map(([label, value]) => (
              <p key={label} style={styles['paragraph']}>
                {label}: <code style={styles['code']}>{value}</code>
              </p>
            ))}
          </details>
        )}
      </Error>
    </>
  )
}
