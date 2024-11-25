/**
 * Regular expression pattern to match session ID in URL search parameters
 * Format: `sid=<sessionId>&` where sessionId is at least 20 characters
 * The trailing '&' capture allows replacing `sid=foo&bar=baz` with `bar=baz`
 * @private
 */
const sidPattern = /sid=([^&]{20,})&?/

/**
 * Extracts and removes the session ID from the URL search parameters
 * @public
 * @param {Location} location - Browser's Location object containing URL information
 * @returns {string | null} The session ID if found and valid, null otherwise
 * @example
 * ```ts
 * // For URL: https://example.com?sid=abc123...def&other=param
 * const sessionId = getSidUrlSearch(window.location)
 * // Returns: 'abc123...def'
 * // URL becomes: https://example.com?other=param
 * ```
 * @throws {TypeError} If location parameter is not a valid Location object
 */
export const getSidUrlSearch = (location: Location): string | null => {
  // Validate location parameter is a browser-like Location object
  if (typeof location === 'undefined' || typeof location !== 'object') {
    return null
  }

  // Extract search parameters from location, return null if empty
  const search = location?.search
  if (!search) {
    return null
  }

  // Match session ID pattern in search parameters
  // First capture group [1] contains the actual session ID value
  const [, sidParam] = search.match(sidPattern) || []
  if (!sidParam) {
    return null
  }

  // Remove the session ID parameter from the URL while preserving other parameters
  const newSearch = search.replace(sidPattern, '')
  const newUrl = new URL(location.href)
  // Only keep search string if there are remaining parameters
  newUrl.search = newSearch.length > 1 ? newSearch : ''
  // Uncomment to modify browser URL:
  // location.replace(newUrl)

  return sidParam
}
