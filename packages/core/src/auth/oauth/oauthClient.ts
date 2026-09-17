import {type SanityClient} from '@sanity/client'

import {REQUEST_TAG_PREFIX} from '../authConstants'
import {type AuthStoreState} from '../authStore'
import {type OAuthTokens} from './types'

/** The token endpoint's JSON response shape. */
export interface TokenEndpointResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
}

type AuthOptions = AuthStoreState['options']

/** Auth store options narrowed to an instance configured for OAuth. */
export type ConfiguredOAuthOptions = AuthOptions & {oauth: NonNullable<AuthOptions['oauth']>}

/** Builds the RFC 8707 resource indicator for an organisation. */
function getResourceIndicator(organizationId: string): string {
  return `urn:io.sanity:organization:${organizationId}`
}

/**
 * Appends the RFC 8707 `resource` indicator to `params` when an organisation
 * id is configured. Without one, the request is left unscoped.
 */
export function appendResourceIndicator(
  params: URLSearchParams,
  oauth: ConfiguredOAuthOptions['oauth'],
): void {
  if (oauth.organizationId) {
    params.append('resource', getResourceIndicator(oauth.organizationId))
  }
}

/**
 * Serialises tokens for storage, converting `expiresAt` to an ISO string.
 *
 * @internal
 */
export function serializeTokens(tokens: OAuthTokens): string {
  return JSON.stringify({
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
    expiresAt: tokens.expiresAt.toISOString(),
    ...(tokens.refreshToken !== undefined && {refreshToken: tokens.refreshToken}),
  })
}

/**
 * Reads the store options, throwing when the instance was not configured for
 * OAuth.
 */
export function getOAuthOptions(state: AuthStoreState): ConfiguredOAuthOptions {
  const {options} = state
  if (!options.oauth) {
    throw new Error('OAuth is not configured on this instance (missing `auth.oauth`).')
  }
  return options as ConfiguredOAuthOptions
}

/** Creates a client for the (unauthenticated) public OAuth token/revoke calls. */
export function createOAuthClient(options: AuthOptions): SanityClient {
  return options.clientFactory({
    apiVersion: 'v1',
    requestTagPrefix: REQUEST_TAG_PREFIX,
    useProjectHostname: false,
    useCdn: false,
    ...(options.apiHost && {apiHost: options.apiHost}),
  })
}

/** POSTs form-encoded params to the OAuth token endpoint. */
export function postTokenRequest(
  client: SanityClient,
  params: URLSearchParams,
  tag: string,
): Promise<TokenEndpointResponse> {
  return client.request<TokenEndpointResponse>({
    method: 'POST',
    url: '/auth/oauth/token',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: params.toString(),
    tag,
  })
}

/** Converts a token endpoint response to the {@link OAuthTokens} shape. */
export function toOAuthTokens(response: TokenEndpointResponse): OAuthTokens {
  return {
    accessToken: response.access_token,
    tokenType: 'bearer',
    expiresIn: response.expires_in,
    expiresAt: new Date(Date.now() + response.expires_in * 1000),
    ...(response.refresh_token !== undefined && {refreshToken: response.refresh_token}),
  }
}
