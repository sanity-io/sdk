import {CorsOriginError} from '@sanity/client'

export function getCorsErrorProjectId(error: Error): string | null {
  if (!(error instanceof CorsOriginError)) return null

  const message = (error as unknown as {message?: string}).message || ''
  const projMatch = message.match(/manage\/project\/([^/?#]+)/)
  return projMatch ? projMatch[1] : null
}
