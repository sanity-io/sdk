/**
 * PKCE (Proof Key for Code Exchange, RFC 7636) helpers for the OAuth
 * authorization-code flow.
 *
 * @internal
 */

/** Number of random bytes used for the `code_verifier` and `state`. */
const RANDOM_BYTE_LENGTH = 32

/**
 * Encodes a byte array as a base64url string (RFC 4648 §5) with no padding,
 * as required for PKCE `code_verifier`/`code_challenge` values.
 *
 * @internal
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(): string {
  const bytes = new Uint8Array(RANDOM_BYTE_LENGTH)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

/**
 * Generates a PKCE `code_verifier`
 *
 * @internal
 */
export function generateCodeVerifier(): string {
  return randomString()
}

/**
 * Generates the `state` parameter used to defend against CSRF on the OAuth
 * callback.
 *
 * @internal
 */
export function generateState(): string {
  return randomString()
}

/**
 * Derives the PKCE `code_challenge` from a `code_verifier` using
 * `base64url(sha256(verifier))` (the `S256` method).
 *
 * @internal
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}
