import {CorsOriginError} from '@sanity/client'

/**
 * @public
 * Extracts the project ID from a CorsOriginError message.
 * @param error - The error to extract the project ID from.
 * @returns The project ID or null if the error is not a CorsOriginError.
 */
export function getCorsErrorProjectId(error: Error): string | null {
  if (!(error instanceof CorsOriginError)) return null

  const message = (error as unknown as {message?: string}).message || ''
  const projMatch = message.match(/manage\/project\/([^/?#]+)/)
  return projMatch ? projMatch[1] : null
}
