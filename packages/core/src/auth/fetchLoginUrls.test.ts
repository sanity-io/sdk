import {type AuthProvider} from '../config/authConfig'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {fetchLoginUrls} from './fetchLoginUrls'

let instance: SanityInstance | undefined

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  instance?.dispose()
})

describe('fetchLoginUrls', () => {
  it('returns providers with updated URLs', async () => {
    const request = vi.fn().mockResolvedValue({
      providers: [
        {title: 'Provider A', name: 'a', url: 'https://auth.example.com/a'},
        {title: 'Provider B', name: 'b', url: 'https://auth.example.com/b'},
      ] satisfies AuthProvider[],
    })
    const clientFactory = vi.fn().mockReturnValue({request})
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory},
    })
    const providers = await fetchLoginUrls(instance)

    expect(providers.length).toBe(2)
    expect(providers[0].url).toContain('withSid=true')
    expect(providers[1].url).toContain('withSid=true')
  })

  it('caches the providers and early returns', async () => {
    const provider: AuthProvider = {
      name: 'cached-provided',
      title: 'cached provider',
      url: 'https://auth.example.com',
    }
    const request = vi.fn().mockResolvedValue({providers: [provider]})
    const clientFactory = vi.fn().mockReturnValue({request})
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {clientFactory},
    })

    const providers = await fetchLoginUrls(instance)

    expect(providers.length).toBe(1)
    expect(providers[0].url.startsWith(provider.url)).toBe(true)

    expect(await fetchLoginUrls(instance)).toBe(providers)
    expect(request).toHaveBeenCalledOnce()
  })

  it('handles providers as a static array and merges/replaces accordingly', async () => {
    const request = vi.fn().mockResolvedValue({
      providers: [
        {title: 'Provider A', name: 'a', url: 'https://auth.example.com/a'},
        {title: 'Provider B', name: 'b', url: 'https://auth.example.com/b'},
      ],
    })
    const clientFactory = vi.fn().mockReturnValue({request})
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        providers: [
          {
            title: 'Custom Provider B',
            name: 'custom-provider-b',
            url: 'https://auth.example.com/b',
          },
          {title: 'Provider C', name: 'provider-c', url: 'https://auth.example.com/c'},
        ],
      },
    })
    const providers = await fetchLoginUrls(instance)

    expect(providers.find((p) => p.title === 'Provider A')).toBeTruthy()
    expect(providers.find((p) => p.title === 'Custom Provider B')).toBeTruthy()
    expect(providers.find((p) => p.title === 'Provider C')).toBeTruthy()
    expect(providers.find((p) => p.title === 'Provider B')).toBeFalsy()
  })

  it('allows custom provider function modification', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
    })
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        providers: (defaults) => defaults.map((p) => ({...p, title: 'Modified ' + p.title})),
      },
    })
    const providers = await fetchLoginUrls(instance)

    expect(providers[0].title).toBe('Modified Provider A')
  })

  it('uses default providers if none are specified', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
    })
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
      },
    })
    const providers = await fetchLoginUrls(instance)

    expect(providers.length).toBe(1)
    expect(providers[0].title).toBe('Provider A')
  })

  it('includes callbackUrl in provider URLs if set', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
    })
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        callbackUrl: 'http://localhost/callback',
      },
    })
    const providers = await fetchLoginUrls(instance)
    expect(providers[0].url).toContain('origin=http%3A%2F%2Flocalhost%2Fcallback')
  })

  it('should allow async custom provider function', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
    })
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        providers: async (defaults) => {
          await new Promise((r) => setTimeout(r, 10))
          return defaults.concat([
            {title: 'Provider C', name: 'provider-c', url: 'https://auth.example.com/c'},
          ])
        },
      },
    })

    const providers = await fetchLoginUrls(instance)

    expect(providers.length).toBe(2)
    expect(providers.some((p) => p.title === 'Provider C')).toBe(true)
  })
})
