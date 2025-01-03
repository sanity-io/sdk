import {type ClientError} from '@sanity/client'

/**
 * This is used in place of `instanceof` so the matching can be more robust and
 * won't have any issues with dual packages etc
 * https://nodejs.org/api/packages.html#dual-package-hazard
 *
 * @internal
 */
export function isClientError(e: unknown): e is ClientError {
  if (typeof e !== 'object') return false
  if (!e) return false
  return 'statusCode' in e && 'response' in e
}
