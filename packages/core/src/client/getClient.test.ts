import type {SanityClient} from '@sanity/client'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import type {SanityInstance} from '../instance/types'
import {getClient} from './getClient'
import {type ClientStore, getClientStore} from './store/clientStore'

// Mock the getClientStore module
vi.mock('./store/clientStore', () => ({
  getClientStore: vi.fn(),
}))

describe('getClient', () => {
  const mockClient = {} as SanityClient
  const getOrCreateClient = vi.fn()
  const mockInstance = {} as SanityInstance

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    // Setup mock implementation
    getOrCreateClient.mockReturnValue(mockClient)

    const mockGetClientStore = vi.fn().mockReturnValue({
      getOrCreateClient,
    } as unknown as ClientStore)

    // Set the mock implementation for getClientStore
    vi.mocked(getClientStore).mockImplementation(mockGetClientStore)
  })

  it('should get client from store with provided options', () => {
    const options = {apiVersion: '2024-01-01'}
    const result = getClient(options, mockInstance)

    expect(getClientStore).toHaveBeenCalledWith(mockInstance)
    expect(getOrCreateClient).toHaveBeenCalledWith(options)
    expect(result).toBe(mockClient)
  })
})
