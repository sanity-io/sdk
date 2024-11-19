import {type SanityClient} from '@sanity/client'
import {beforeEach, describe, expect, it} from 'vitest'

import {type ClientStore, createClientStore} from './clientStore'

// Mock SanityClient
const mockWithConfig = vi.fn()
const mockClient = {
  withConfig: mockWithConfig,
} as unknown as SanityClient

describe('clientStore', () => {
  let store: ClientStore

  beforeEach(() => {
    // Reset mock and create fresh store for each test
    mockWithConfig.mockClear()
    store = createClientStore(mockClient)
  })

  it('throws error when apiVersion is missing', () => {
    const getClient = store.getState().getClient

    // @ts-expect-error Testing invalid input
    expect(() => getClient({})).toThrow('Missing required `apiVersion` option')
    // @ts-expect-error Testing invalid input
    expect(() => getClient()).toThrow('Missing required `apiVersion` option')
  })

  it('creates new client when apiVersion is not found', () => {
    const newClientMock = {id: 'new-client'} as unknown as SanityClient
    mockWithConfig.mockReturnValue(newClientMock)

    const getClient = store.getState().getClient
    const result = getClient({apiVersion: '2024-01-01'})

    expect(mockWithConfig).toHaveBeenCalledWith({apiVersion: '2024-01-01'})
    expect(result).toBe(newClientMock)
  })

  it('reuses existing client for same apiVersion', () => {
    const newClientMock = {id: 'new-client'} as unknown as SanityClient
    mockWithConfig.mockReturnValue(newClientMock)

    const getClient = store.getState().getClient

    // First call should create new client
    const result1 = getClient({apiVersion: '2024-01-01'})
    // Second call should return existing client
    const result2 = getClient({apiVersion: '2024-01-01'})

    expect(mockWithConfig).toHaveBeenCalledTimes(1)
    expect(result1).toBe(newClientMock)
    expect(result2).toBe(newClientMock)
  })

  it('creates different clients for different apiVersions', () => {
    const client1Mock = {id: 'client-1'} as unknown as SanityClient
    const client2Mock = {id: 'client-2'} as unknown as SanityClient

    mockWithConfig.mockReturnValueOnce(client1Mock).mockReturnValueOnce(client2Mock)

    const getClient = store.getState().getClient

    const result1 = getClient({apiVersion: '2024-01-01'})
    const result2 = getClient({apiVersion: '2024-02-01'})

    expect(mockWithConfig).toHaveBeenCalledTimes(2)
    expect(result1).toBe(client1Mock)
    expect(result2).toBe(client2Mock)
    expect(result1).not.toBe(result2)
  })
})
