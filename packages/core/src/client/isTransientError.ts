import {ClientError, ConnectionFailedError, CorsOriginError} from '@sanity/client'

/**
 * The HTTP status of a failed request, or `undefined` when no response arrived.
 * @internal
 */
export function getStatusCode(error: unknown): number | undefined {
  if (error instanceof ClientError) return error.statusCode

  return error instanceof ConnectionFailedError ? error.status : undefined
}

/**
 * Whether a failed request can succeed when sent again: a network error, 408, 429 or 5xx.
 * @internal
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof CorsOriginError) return false

  const statusCode = getStatusCode(error)

  return statusCode === undefined || statusCode >= 500 || statusCode === 408 || statusCode === 429
}
