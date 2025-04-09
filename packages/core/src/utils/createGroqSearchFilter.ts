const WILDCARD_TOKEN = '*'
const NEGATION_TOKEN = '-'
// This regex handles simple cases including quoted phrases.
// More complex query syntaxes might need a more robust parser.
const TOKEN_REGEX = /(?:[^\s"]+|"[^"]*")+/g

/**
 * @internal
 * Checks if a token starts with the negation character.
 */
function isNegationToken(token: string | undefined): boolean {
  return typeof token !== 'undefined' && token.trim().startsWith(NEGATION_TOKEN)
}

/**
 * @internal
 * Checks if a token ends with the wildcard character.
 */
function isPrefixToken(token: string | undefined): boolean {
  return typeof token !== 'undefined' && token.trim().endsWith(WILDCARD_TOKEN)
}

/**
 * @internal
 * Checks if a token is enclosed in double quotes.
 */
function isExactMatchToken(token: string | undefined): boolean {
  // Ensure the token exists, has at least 2 characters, and starts/ends with "
  return !!token && token.length >= 2 && token.startsWith('"') && token.endsWith('"')
}

/**
 * Creates a GROQ search filter string (`[@] match text::query("...")`)
 * from a raw search query string.
 *
 * It applies wildcard ('*') logic to the last eligible token and escapes
 * double quotes within the search term.
 *
 * If the input query is empty or only whitespace, it returns an empty string.
 *
 * @param query - The raw input search string.
 * @returns The GROQ search filter string, or an empty string.
 * @internal
 */
export function createGroqSearchFilter(query: string): string {
  // Trim leading/trailing whitespace from the overall query first
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return '' // Return empty if query is empty or just whitespace
  }

  // Extract tokens using the regex
  const tokens = trimmedQuery.match(TOKEN_REGEX) ?? []

  // Find the index of the last token eligible for wildcard appending
  const reversedTokens = [...tokens].reverse()
  const reversedIndex = reversedTokens.findIndex(
    (token: string) => !isNegationToken(token) && !isExactMatchToken(token),
  )
  const finalIncrementalTokenIndex = reversedIndex === -1 ? -1 : tokens.length - 1 - reversedIndex

  // Get the actual token based on the found index
  const finalIncrementalToken = tokens[finalIncrementalTokenIndex]

  const processedTokens = [...tokens]
  // If a suitable token was found and it doesn't already end with a wildcard,
  // apply the wildcard.
  if (finalIncrementalToken !== undefined && !isPrefixToken(finalIncrementalToken)) {
    // Replace the identified token with its wildcarded version
    processedTokens.splice(
      finalIncrementalTokenIndex,
      1,
      `${finalIncrementalToken}${WILDCARD_TOKEN}`,
    )
  }

  // Join the tokens back into a space-separated string
  const wildcardSearch = processedTokens.join(' ')

  // Escape double quotes within the final search term for the GROQ query
  const escapedSearch = wildcardSearch.replace(/"/g, '\\"')

  // Construct the final GROQ filter clause
  return `[@] match text::query("${escapedSearch}")`
}
