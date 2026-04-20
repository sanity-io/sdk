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
 * Determines whether the SDK should enable dev-mode telemetry.
 *
 * Combines a browser URL check (localhost/127.0.0.1) with a Node.js
 * environment variable check (`NODE_ENV === 'development'`). Returns
 * false in production environments so bundlers can tree-shake the
 * telemetry code path entirely.
 *
 * @returns True if the SDK is running in a development environment
 * @internal
 */
export function isDevMode(): boolean {
  if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'production') {
    return false
  }

  if (typeof window !== 'undefined') {
    return isLocalUrl(window)
  }

  return typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'development'
}
