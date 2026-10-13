import {ClientError} from '@sanity/client'

import {type SanityInstance} from '../store/createSanityInstance'
import {getCurrentUserState} from './authStore'
import {getClientErrorApiBody, getClientErrorApiProjectId, getClientErrorApiType} from './utils'

/**
 * Identifiers from a `projectUserNotFoundError` response. Each field is
 * optional because older API responses only carry a description.
 *
 * @internal
 */
export interface ProjectAccessErrorDetails {
  /** The project the failed request was made against. */
  projectId?: string
  /** The global ID of the signed-in user, which has no membership in the project. */
  userId?: string
  /** The trace ID of the failed request. Support uses it to find the request in logs. */
  traceId?: string
}

function findClientError(error: unknown): ClientError | null {
  if (error instanceof ClientError) return error
  if (error instanceof Error && error.cause instanceof ClientError) return error.cause
  return null
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/**
 * Reads the identifiers from the 401 `projectUserNotFoundError` that the
 * Content Lake returns when the signed-in user is not a member of the project.
 * Accepts the `ClientError` itself or an error that wraps it as its `cause`,
 * such as the React package's `AuthError`.
 *
 * @returns The identifiers, or `null` when the error is not a
 *   `projectUserNotFoundError`.
 * @internal
 */
export function getProjectAccessErrorDetails(error: unknown): ProjectAccessErrorDetails | null {
  const clientError = findClientError(error)
  if (
    !clientError ||
    clientError.statusCode !== 401 ||
    getClientErrorApiType(clientError) !== 'projectUserNotFoundError'
  ) {
    return null
  }

  const body = getClientErrorApiBody(clientError)?.error
  return {
    projectId: getClientErrorApiProjectId(clientError),
    userId: stringOrUndefined(body?.userID),
    traceId: stringOrUndefined(clientError.traceId),
  }
}

/**
 * Returns the ID of the project that rejected a request because the signed-in
 * user isn't a member of it. The Content Lake reports this as a 401
 * `projectUserNotFoundError`. It usually means the user signed in with a
 * different account than the one that has access, for example Google instead
 * of SSO with the same email address.
 *
 * When this error reaches the SDK's `AuthBoundary`, the boundary replaces the
 * whole app with a screen that explains the problem. An app-level error
 * boundary inside `AuthBoundary` catches the error first, so it decides where
 * the error goes. Rethrow it when the app can't work without the rejected
 * project. Handle it in place when only part of the app reads from that
 * project, so a user who can access the app's other projects can keep using
 * them.
 *
 * @param error - The value to inspect. A `ClientError`, or an error that wraps
 *   one as its `cause`.
 * @returns The rejected project's ID, or `null` when the error isn't a
 *   `projectUserNotFoundError` or the response doesn't name the project.
 *
 * @example Rethrowing only for the project the whole app needs
 * ```tsx
 * const MAIN_PROJECT_ID = 'abc123'
 *
 * function Fallback({error}: FallbackProps) {
 *   const projectId = getProjectAccessErrorProjectId(error)
 *   // The app can't work without its main project, so let AuthBoundary
 *   // replace it with the project access screen.
 *   if (projectId === MAIN_PROJECT_ID) throw error
 *   if (projectId) return <p>You don't have access to project {projectId}.</p>
 *   return <p>Something went wrong.</p>
 * }
 * ```
 *
 * @category Authentication
 * @public
 */
export function getProjectAccessErrorProjectId(error: unknown): string | null {
  return getProjectAccessErrorDetails(error)?.projectId ?? null
}

// Provider IDs come from the `provider` field of `/users/me`. SAML providers
// are org-configured and arrive as `saml-<providerId>`.
const SIGN_IN_METHOD_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  sanity: 'email and password',
  vercel: 'Vercel',
}

/**
 * Returns a user-facing name for a `/users/me` `provider` value, such as
 * `Google` for `google` or `SSO` for any `saml-*` provider.
 *
 * @returns The label, or `undefined` for an unknown or missing provider.
 * @internal
 */
export function getSignInMethodLabel(provider: string | undefined): string | undefined {
  if (!provider) return undefined
  if (provider.startsWith('saml-')) return 'SSO'
  return SIGN_IN_METHOD_LABELS[provider]
}

// Names the sign-in method but never the email address, because error
// messages end up in logs and error trackers.
function getProjectAccessErrorMessage(
  details: ProjectAccessErrorDetails,
  provider: string | undefined,
): string {
  const method = getSignInMethodLabel(provider)
  const account = method ? `Your Sanity account (signed in with ${method})` : 'Your Sanity account'
  const project = details.projectId ? `project ${details.projectId}` : 'this project'
  // Matches the trace ID suffix @sanity/client adds to ClientError messages.
  const traceId = details.traceId ? ` (traceId: ${details.traceId})` : ''
  return (
    `${account} isn't a member of ${project}. ` +
    'Each sign-in method, such as Google or SSO, is a separate account. ' +
    `Sign out and sign in with the account that has access.${traceId}`
  )
}

// Keeps everything the original ClientError carries (status code, response
// body, trace ID) so `instanceof ClientError` checks and
// `getProjectAccessErrorDetails` keep working on it.
class ProjectAccessClientError extends ClientError {
  constructor(error: ClientError, message: string) {
    super(error.response)
    this.message = message
  }
}

/**
 * Replaces the API's `projectUserNotFoundError` message with one that tells
 * the user what to do. Hooks throw store errors to the nearest error boundary,
 * and most boundaries, including routers' default error screens, render
 * `error.message`. Any other error is returned unchanged.
 *
 * @internal
 */
export function withProjectAccessMessage(instance: SanityInstance, error: unknown): unknown {
  if (!(error instanceof ClientError) || error instanceof ProjectAccessClientError) return error
  const details = getProjectAccessErrorDetails(error)
  if (!details) return error

  const provider = getCurrentUserState(instance).getCurrent()?.provider
  return new ProjectAccessClientError(error, getProjectAccessErrorMessage(details, provider))
}
