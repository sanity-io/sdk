export function isInIframe(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top
}

/**
 * @internal
 *
 * Checks if the current URL is a local URL.
 *
 * @param window - The window object
 * @returns True if the current URL is a local URL, false otherwise
 */
export function isLocalUrl(window: Window): boolean {
  const url = typeof window !== 'undefined' ? window.location.href : ''

  return (
    url.startsWith('http://localhost') ||
    url.startsWith('https://localhost') ||
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('https://127.0.0.1')
  )
}
