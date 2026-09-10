/**
 * OAuth tokens issued by Sanity's OAuth token endpoint.
 *
 * @public
 */
export interface OAuthTokens {
  accessToken: string
  tokenType: 'bearer'
  expiresIn: number
  expiresAt: Date
  refreshToken?: string
}
