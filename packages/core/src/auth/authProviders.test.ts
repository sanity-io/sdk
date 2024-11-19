import {describe, it, expect} from 'vitest'
import {getAuthProviders, type AuthProvider} from './authProviders'

describe('getAuthProviders', () => {
  it('returns the correct number of providers', () => {
    const providers = getAuthProviders('http://callback.url', 'project123')
    expect(providers).toHaveLength(3)
  })

  it('formats provider URLs correctly', () => {
    const callbackUrl = 'http://localhost:3000'
    const projectId = 'test123'
    const providers = getAuthProviders(callbackUrl, projectId)

    providers.forEach((provider: AuthProvider) => {
      expect(provider.url).toBe(
        `https://api.sanity.io/v1/auth/login/${provider.name}?origin=${encodeURIComponent(
          callbackUrl,
        )}&projectId=${projectId}&type=dual`,
      )
    })
  })

  it('includes all required provider properties', () => {
    const providers = getAuthProviders('http://callback.url', 'project123')

    providers.forEach((provider: AuthProvider) => {
      expect(provider).toHaveProperty('name')
      expect(provider).toHaveProperty('title')
      expect(provider).toHaveProperty('url')
    })
  })

  it('includes the expected providers', () => {
    const providers = getAuthProviders('http://callback.url', 'project123')
    const providerNames = providers.map((p) => p.name)

    expect(providerNames).toContain('google')
    expect(providerNames).toContain('github')
    expect(providerNames).toContain('sanity')
  })

  it('properly encodes callback URL', () => {
    const callbackUrl = 'http://localhost:3000/callback?param=value'
    const projectId = 'test123'
    const providers = getAuthProviders(callbackUrl, projectId)

    providers.forEach((provider: AuthProvider) => {
      expect(provider.url).toContain(encodeURIComponent(callbackUrl))
    })
  })
})
