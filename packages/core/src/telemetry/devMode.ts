/**
 * Checks whether the current URL points to a local development server.
 *
 * @param win - The window object to check
 * @returns True if running on localhost or 127.0.0.1
 * @internal
 */
function isLocalUrl(win: Window): boolean {
  const url = win.location?.href
  if (!url) return false
  return (
    url.startsWith('http://localhost') ||
    url.startsWith('https://localhost') ||
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('https://127.0.0.1')
  )
}

/**
 * Determines whether the SDK should enable dev-mode telemetry for the
 * SDK consumer (i.e. a developer building an app with `@sanity/sdk`).
 *
 * Browser: returns true only when the URL is `localhost` or `127.0.0.1`.
 * The URL check is the primary signal because consumer bundlers may or
 * may not forward `NODE_ENV` to the browser reliably.
 *
 * Node (scripts / non-browser): falls back to `NODE_ENV === 'development'`.
 *
 * Bracket-notation `process.env['NODE_ENV']` is used to avoid bundler
 * dead-code replacement.
 *
 * @returns True if the SDK is running in a development environment
 * @internal
 */
export function isDevMode(): boolean {
  if (typeof window !== 'undefined') {
    return isLocalUrl(window)
  }

  return typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'development'
}
