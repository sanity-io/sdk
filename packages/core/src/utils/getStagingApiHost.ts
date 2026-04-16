declare const __SANITY_STAGING__: boolean | undefined

/**
 * Returns the staging API host if the `__SANITY_STAGING__` build-time flag is
 * set to `true` (mirroring how Sanity Studio detects staging builds).
 *
 * @internal
 */
export function getStagingApiHost(): string | undefined {
  if (typeof __SANITY_STAGING__ !== 'undefined' && __SANITY_STAGING__ === true) {
    return 'https://api.sanity.work'
  }
  return undefined
}
