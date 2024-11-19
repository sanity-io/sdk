import type {SanityClient} from '@sanity/client'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import type {SanityInstance} from '../instance/types'
import type {ClientStore} from './clientStore'
import {getClient} from './getClient'
import {getClientStore} from './getClientStore'

// Mock the getClientStore module
vi.mock('./getClientStore', () => ({
  getClientStore: vi.fn(),
}))

describe('getClient', () => {
  const mockClient = {} as SanityClient
  const mockGetClient = vi.fn()
  const mockInstance = {} as SanityInstance

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    // Setup mock implementation
    mockGetClient.mockReturnValue(mockClient)
    vi.mocked(getClientStore).mockReturnValue({
      getState: () => ({
        getClient: mockGetClient,
        clients: {},
      }),
    } as unknown as ClientStore)
  })

  it('should get client from store with provided options', () => {
    const options = {apiVersion: '2024-01-01'}

    const result = getClient(options, mockInstance)

    // Verify getClientStore was called with instance
    expect(getClientStore).toHaveBeenCalledWith(mockInstance)

    // Verify getClient was called with options
    expect(mockGetClient).toHaveBeenCalledWith(options)

    // Verify the returned client
    expect(result).toBe(mockClient)
  })
})
