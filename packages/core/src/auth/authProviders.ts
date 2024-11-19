/**
 * Auth provider
 * @public
 */
export interface AuthProvider {
  name: string
  title: string
  url: string
  signUpUrl?: string
}

/**
 * Returns the auth providers and their URLs
 * @public
 */
export const getAuthProviders = (callbackUrl: string, projectId: string): AuthProvider[] => {
  // TODO:SAML https://api.sanity.io/v2021-10-01/auth/organizations/by-slug/sanity/providers
  // https://api.sanity.io/v1/auth/login/google?origin=http%3A%2F%2Flocalhost%3A5173%2F&projectId=r500rrr6&type=dual
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
    url: `https://api.sanity.io/v1/auth/login/${provider.name}?origin=${encodeURIComponent(callbackUrl)}&projectId=${projectId}&type=dual`,
  }))
}
