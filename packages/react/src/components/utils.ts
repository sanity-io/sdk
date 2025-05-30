import {type ClientError} from '@sanity/client'

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

/**
 * @internal
 *
 * Checks if the ClientError is an authentication error that requires a logout.
 *
 * @param error - The ClientError to check
 * @returns True if the error is an authentication error that requires a logout, false otherwise
 */
export function isAuthError(error: ClientError): boolean {
  const SANITY_AUTH_ERROR_CODES = [
    'SIO-401-ANF', // The token specified is not valid or has been deleted
    'SIO-401-AWH', // The token specified does not belong to the configured project
    'SIO-401-AEX', // The token is expired
  ] as const
  if (error.statusCode !== 401) {
    return false
  }
  const errorCode = error.response.body.errorCode
  if (!errorCode) {
    return false
  }
  return SANITY_AUTH_ERROR_CODES.includes(errorCode)
}
