// Trailing '&' included so we can replace `#sid=foo&bar=baz` with `#bar=baz`
const sidPattern = /sid=([^&]{20,})&?/

/**
 * Get the session ID from the URL hash
 * @public
 */
export const getSidUrlSearch = (location: Location): string | null => {
  // Are we in a browser-like environment?
  if (typeof location === 'undefined' || typeof location !== 'object') {
    return null
  }

  // Does the hash contain a valid session ID?
  const search = location?.search
  if (!search) {
    return null
  }

  // The first element will be the entire match, including `sid=` - we only care about
  // the first _group_, being the actual _value_ of the parameter, thus the leading comma
  const [, sidParam] = search.match(sidPattern) || []
  if (!sidParam) {
    return null
  }

  // Remove the parameter from the URL
  const newSearch = search.replace(sidPattern, '')
  const newUrl = new URL(location.href)
  newUrl.search = newSearch.length > 1 ? newSearch : ''
  // location.replace(newUrl)

  return sidParam
}
