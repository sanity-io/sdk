/**
 * The authorization server refused the sign-in and sent an error back to the redirect URI.
 * Branch on `code`: `message` is for people and can change.
 *
 * @public
 */
export class OAuthError extends Error {
  /** The OAuth error code the server sent, such as `invalid_target` or `access_denied`. */
  readonly code: string
  /** The server's explanation, when it sent one. */
  readonly description: string | undefined

  /** Creates an error from the `error` and `error_description` the server sent. */
  constructor(code: string, description?: string) {
    super(description ? `${code}: ${description}` : code)
    this.name = 'OAuthError'
    this.code = code
    this.description = description
  }
}
