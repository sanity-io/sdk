import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'
import {tradeTokenForSession} from './tradeTokenForSession'

// Mock the getClient module
vi.mock('../client/getClient', () => ({
  getClient: vi.fn(),
}))

describe('tradeTokenForSession', () => {
  const mockSanityInstance = {
    // Add minimal required properties for SanityInstance
    identity: {
      projectId: 'test-project',
      dataset: 'test-dataset',
    },
    config: {
      token: 'test-token',
    },
  } as SanityInstance

  it('should return undefined if sessionId is empty', async () => {
    const result = await tradeTokenForSession('', mockSanityInstance)
    expect(result).toBeUndefined()
  })

  it('should return token when request is successful', async () => {
    const mockToken = 'test-token-123'
    const mockRequest = vi.fn().mockResolvedValue({token: mockToken})

    // Mock the client returned by getClient
    const mockClient = {request: mockRequest} as unknown as SanityClient
    vi.mocked(getClient).mockReturnValue(mockClient)

    const sessionId = 'test-session-id'
    const result = await tradeTokenForSession(sessionId, mockSanityInstance)

    expect(getClient).toHaveBeenCalledWith({apiVersion: 'v2024-11-22'}, mockSanityInstance)
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      uri: '/auth/fetch',
      query: {sid: sessionId},
      tag: 'auth.fetch-token',
    })
    expect(result).toBe(mockToken)
  })

  it('should propagate errors from the client request', async () => {
    const mockError = new Error('Request failed')
    const mockRequest = vi.fn().mockRejectedValue(mockError)

    // Mock the client returned by getClient
    const mockClient = {request: mockRequest} as unknown as SanityClient
    vi.mocked(getClient).mockReturnValue(mockClient)

    await expect(tradeTokenForSession('test-session-id', mockSanityInstance)).rejects.toThrow(
      mockError,
    )
  })
})
