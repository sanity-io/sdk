/**
 * Represents an authentication provider configuration
 * @public
 * @interface AuthProvider
 * @property {string} name - Unique identifier for the auth provider (e.g., 'google', 'github')
 * @property {string} title - Display name for the auth provider in the UI
 * @property {string} url - Complete authentication URL including callback and token parameters
 * @property {string} [signUpUrl] - Optional URL for direct sign-up flow
 */
export interface AuthProvider {
  name: string
  title: string
  url: string
  signUpUrl?: string
}

/**
 * Generates a list of configured authentication providers with their respective URLs
 * @public
 * @param {string} callbackUrl - The URL where the auth provider should redirect after authentication
 * @returns {AuthProvider[]} Array of configured auth providers with complete authentication URLs
 * @example
 * ```ts
 * const providers = getAuthProviders('https://myapp.com/callback');
 * // Returns: [{name: 'google', title: 'Google', url: 'https://api.sanity.io/v1/auth/login/google?...'}, ...]
 * ```
 */
export const getAuthProviders = (callbackUrl: string): AuthProvider[] => {
  // Configure supported authentication providers
  // SAML providers will be added later as the SAML company ID slug will need to be fetched from the API:
  // https://api.sanity.io/v2021-10-01/auth/organizations/by-slug/${slug}/providers
  return [
    {
      name: 'google',
      title: 'Google',
    },
    {
      name: 'github',
      title: 'GitHub',
    },
    {
      name: 'sanity',
      title: 'E-mail / password',
    },
  ].map((provider) => ({
    ...provider,
    // Construct the authentication URL with the provider name and encoded callback URL
    url: `https://api.sanity.io/v1/auth/login/${provider.name}?origin=${encodeURIComponent(callbackUrl)}&type=token`,
  }))
}
