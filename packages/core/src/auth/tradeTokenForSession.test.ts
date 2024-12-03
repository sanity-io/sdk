import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {createClient} from '@sanity/client'
import {tradeTokenForSession} from './tradeTokenForSession'

// Mock the @sanity/client module
vi.mock('@sanity/client', () => ({
  createClient: vi.fn(),
}))

describe('tradeTokenForSession', () => {
  it('should return undefined if sessionId is empty', async () => {
    const result = await tradeTokenForSession('')
    expect(result).toBeUndefined()
  })

  it('should return token when request is successful', async () => {
    const mockToken = 'test-token-123'
    const mockRequest = vi.fn().mockResolvedValue({token: mockToken})

    // Mock the client returned by createClient
    const mockClient = {request: mockRequest} as unknown as SanityClient
    vi.mocked(createClient).mockReturnValue(mockClient)

    const sessionId = 'test-session-id'
    const result = await tradeTokenForSession(sessionId)

    expect(createClient).toHaveBeenCalledWith({
      apiVersion: 'v2024-12-03',
      ignoreBrowserTokenWarning: true,
      useCdn: false,
      useProjectHostname: false,
      withCredentials: false,
    })
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

    // Mock the client returned by createClient
    const mockClient = {request: mockRequest} as unknown as SanityClient
    vi.mocked(createClient).mockReturnValue(mockClient)

    await expect(tradeTokenForSession('test-session-id')).rejects.toThrow(mockError)
  })
})
