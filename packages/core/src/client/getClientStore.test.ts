import {describe, it, expect, vi, beforeEach} from 'vitest'
import {createClient} from '@sanity/client'
import {getClientStore, DEFAULT_API_VERSION} from './getClientStore'
import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'

// Mock dependencies
vi.mock('@sanity/client')
vi.mock('../instance/sanityInstance', () => ({
  getOrCreateResource: vi.fn(),
}))
vi.mock('../clientStore', () => ({
  createClientStore: vi.fn().mockReturnValue({
    setState: vi.fn(),
    getState: vi.fn(),
    getInitialState: vi.fn(),
    subscribe: vi.fn(),
  }),
}))

describe('getClientStore', () => {
  const mockInstance: SanityInstance = {
    identity: {
      projectId: 'test-project-id',
      dataset: 'test-dataset',
    },
    config: {
      token: 'test-token',
    },
  } as SanityInstance

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getOrCreateResource).mockImplementation((_, __, factory) => factory())
  })

  it('creates a client store with correct configuration', () => {
    // Mock getOrCreateResource to execute the factory function
    vi.mocked(getOrCreateResource).mockImplementation((_, __, factory) => factory())

    const clientStore = getClientStore(mockInstance)

    // Verify client creation
    expect(createClient).toHaveBeenCalledWith({
      projectId: 'test-project-id',
      dataset: 'test-dataset',
      token: 'test-token',
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

  it('uses getOrCreateResource to cache the client store', () => {
    getClientStore(mockInstance)

    expect(getOrCreateResource).toHaveBeenCalledWith(
      mockInstance,
      'clientStore',
      expect.any(Function),
    )
  })
})
