import {createClient} from '@sanity/client'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance, getOrCreateResource} from '../instance/sanityInstance'
import {DEFAULT_API_VERSION, getClientStore} from './getClientStore'

// Mock dependencies
vi.mock('@sanity/client')
vi.mock('../instance/sanityInstance', async () => {
  const mod = await vi.importActual('../instance/sanityInstance')
  return {...mod, getOrCreateResource: vi.fn()}
})
vi.mock('../clientStore', () => ({
  createClientStore: vi.fn().mockReturnValue({
    setState: vi.fn(),
    getState: vi.fn(),
    getInitialState: vi.fn(),
    subscribe: vi.fn(),
  }),
}))

describe('getClientStore', () => {
  const instance = createSanityInstance({
    projectId: 'test-project-id',
    dataset: 'test-dataset',
  })

  // @ts-expect-error TODO: remove this case
  const instanceWithoutProjectId = createSanityInstance({
    dataset: 'test-dataset',
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getOrCreateResource).mockImplementation((_, __, factory) => factory())
  })

  it('creates a client store with correct configuration', () => {
    // Mock getOrCreateResource to execute the factory function
    vi.mocked(getOrCreateResource).mockImplementation((_, __, factory) => factory())

    const clientStore = getClientStore(instance)

    // Verify client creation
    expect(createClient).toHaveBeenCalledWith({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
      useCdn: false,
      apiVersion: DEFAULT_API_VERSION,
    })

    // Update expectation to match actual store shape
    expect(clientStore).toEqual({
      setState: expect.any(Function),
      getState: expect.any(Function),
      getInitialState: expect.any(Function),
      subscribe: expect.any(Function),
    })
  })

  it('it creates a project-less client if no projectId is provided', () => {
    getClientStore(instanceWithoutProjectId)
    expect(createClient).toHaveBeenCalledWith({
      withCredentials: false,
      useProjectHostname: false,
      ignoreBrowserTokenWarning: true,
      apiVersion: DEFAULT_API_VERSION,
      dataset: 'test-dataset',
      useCdn: false,
    })
  })

  it('uses getOrCreateResource to cache the client store', () => {
    getClientStore(instance)

    expect(getOrCreateResource).toHaveBeenCalledWith(instance, 'clientStore', expect.any(Function))
  })
})
