/**
 * Returns the origin string used for the `_origin` request attribution param.
 * In the browser, this is `window.location.origin`. On the server (Node, etc.)
 * where `window.location` isn't available, it returns the literal `"server"`.
 *
 * @internal
 */
export function getOrigin(): string {
  if (
    typeof window !== 'undefined' &&
    window.location &&
    typeof window.location.origin === 'string'
  ) {
    return window.location.origin
  }
  return 'server'
}
