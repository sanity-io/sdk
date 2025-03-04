import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {authStore} from './authStore'
import {fetchLoginUrls} from './fetchLoginUrls'

describe('fetchLoginUrls', () => {
  it('returns providers with updated URLs', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      providers: [
        {title: 'Provider A', url: 'https://auth.example.com/a'},
        {title: 'Provider B', url: 'https://auth.example.com/b'},
      ],
    })
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
      auth: {clientFactory},
    })
    const state = createResourceState(authStore.getInitialState(instance))
    const providers = await fetchLoginUrls({instance, state})

    expect(providers.length).toBe(2)
    expect(providers[0].url).toContain('withSid=true')
    expect(providers[1].url).toContain('withSid=true')
  })

  it('caches the providers and early returns', async () => {
    const clientFactory = vi.fn()
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
      auth: {clientFactory},
    })
    const state = createResourceState(authStore.getInitialState(instance))

    const provider = {
      name: 'cached-provided',
      title: 'cached provider',
      url: 'https://auth.example.com#withSid=true',
    }
    state.set('setInitialProviders', {providers: [provider]})

    const providers = await fetchLoginUrls({instance, state})

    expect(providers.length).toBe(1)
    expect(providers[0].url).toContain('https://auth.example.com#withSid=true')
  })

  it('handles providers as a static array and merges/replaces accordingly', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      providers: [
        {title: 'Provider A', name: 'provider-a', url: 'https://auth.example.com/a'},
        {title: 'Provider B', name: 'provider-b', url: 'https://auth.example.com/b'},
      ],
    })
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
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
    const state = createResourceState(authStore.getInitialState(instance))
    const providers = await fetchLoginUrls({instance, state})

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
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
      auth: {
        clientFactory,
        providers: (defaults) => defaults.map((p) => ({...p, title: 'Modified ' + p.title})),
      },
    })
    const state = createResourceState(authStore.getInitialState(instance))
    const providers = await fetchLoginUrls({instance, state})

    expect(providers[0].title).toBe('Modified Provider A')
  })

  it('uses default providers if none are specified', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
    })
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
      auth: {
        clientFactory,
      },
    })
    const state = createResourceState(authStore.getInitialState(instance))
    const providers = await fetchLoginUrls({instance, state})

    expect(providers.length).toBe(1)
    expect(providers[0].title).toBe('Provider A')
  })

  it('includes callbackUrl in provider URLs if set', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
    })
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
      auth: {
        clientFactory,
        callbackUrl: 'http://localhost/callback',
      },
    })
    const state = createResourceState(authStore.getInitialState(instance))
    const providers = await fetchLoginUrls({instance, state})
    expect(providers[0].url).toContain('origin=http%3A%2F%2Flocalhost%2Fcallback')
  })

  it('should allow async custom provider function', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      providers: [{title: 'Provider A', url: 'https://auth.example.com/a'}],
    })
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const instance = createSanityInstance({
      resources: [
        {
          projectId: 'p',
          dataset: 'd',
        },
      ],
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
    const state = createResourceState(authStore.getInitialState(instance))

    const providers = await fetchLoginUrls({instance, state})

    expect(providers.length).toBe(2)
    expect(providers.some((p) => p.title === 'Provider C')).toBe(true)
  })
})
