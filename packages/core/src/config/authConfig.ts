import {type ClientConfig, type SanityClient} from '@sanity/client'

/**
 * Configuration for an authentication provider
 * @public
 */
export interface AuthProvider {
  /**
   * Unique identifier for the auth provider (e.g., 'google', 'github')
   */
  name: string

  /**
   * Display name for the auth provider in the UI
   */
  title: string

  /**
   * Complete authentication URL including callback and token parameters
   */
  url: string

  /**
   * Optional URL for direct sign-up flow
   */
  signUpUrl?: string
}

/**
 * Configuration options for creating an auth store.
 *
 * @public
 */
export interface AuthConfig {
  /**
   * The initial location href to use when handling auth callbacks.
   * Defaults to the current window location if available.
   */
  initialLocationHref?: string

  /**
   * Factory function to create a SanityClient instance.
   * Defaults to the standard Sanity client factory if not provided.
   */
  clientFactory?: (config: ClientConfig) => SanityClient

  /**
   * Custom authentication providers to use instead of or in addition to the default ones.
   * Can be an array of providers or a function that takes the default providers and returns
   * a modified array or a Promise resolving to one.
   */
  providers?: AuthProvider[] | ((prev: AuthProvider[]) => AuthProvider[] | Promise<AuthProvider[]>)

  /**
   * The API hostname for requests. Usually leave this undefined, but it can be set
   * if using a custom domain or CNAME for the API endpoint.
   */
  apiHost?: string

  /**
   * Storage implementation to persist authentication state.
   * Defaults to `localStorage` if available.
   */
  storageArea?: Storage

  /**
   * A callback URL for your application.
   * If none is provided, the auth API will redirect back to the current location (`location.href`).
   * When handling callbacks, this URL's pathname is checked to ensure it matches the callback.
   */
  callbackUrl?: string

  /**
   * A static authentication token to use instead of handling the OAuth flow.
   * When provided, the auth store will remain in a logged-in state with this token,
   * ignoring any storage or callback handling.
   */
  token?: string
}
