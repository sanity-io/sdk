import {createClient, type SanityClient} from '@sanity/client'
import {beforeEach, describe, expect, vi} from 'vitest'

import type {SanityInstance} from '../instance/types'
import {getSessionStore} from './getSessionStore'
import {LOGGED_IN_STATES, type SessionStore} from './sessionStore'
import {tradeTokenForSession} from './tradeTokenForSession'

vi.mock('../client/getClient')
vi.mock('./fetchSessionUser')
vi.mock('./getSessionStore')

describe('tradeTokenForSession', () => {
  const mockSanityInstance = {projectId: 'test-project'} as unknown as SanityInstance
  const mockSetLoggedInState = vi.fn()
  const mockSetSessionId = vi.fn()
  const mockOnSuccess = vi.fn()

  // const mockClient = {
  //   request: vi.fn().mockResolvedValue({token: mockToken}),
  // }

  // Mock the @sanity/client module
  vi.mock('@sanity/client', () => ({
    createClient: vi.fn(),
  }))

  beforeEach(() => {
    vi.clearAllMocks()

    // vi.mocked(fetchSessionUser).mockResolvedValue(null)
    vi.mocked(getSessionStore).mockReturnValue({
      getState: () => ({
        setLoggedInState: mockSetLoggedInState,
        setSessionId: mockSetSessionId,
      }),
    } as unknown as SessionStore)
  })

  it('should return undefined if sessionId is empty', async () => {
    const result = await tradeTokenForSession('', mockSanityInstance)
    expect(result).toBeUndefined()
  })

  describe('tradeTokenForSession', () => {
    it('should return undefined if sessionId is empty', async () => {
      const result = await tradeTokenForSession('', mockSanityInstance)
      expect(result).toBeUndefined()
    })

    it('should return token when request is successful', async () => {
      const mockToken = 'test-token-123'
      const mockRequest = vi.fn().mockResolvedValue({token: mockToken})

      // Mock the client returned by createClient
      const mockClient = {request: mockRequest} as unknown as SanityClient
      vi.mocked(createClient).mockReturnValue(mockClient)

      const sessionId = 'test-session-id'
      const result = await tradeTokenForSession(sessionId, mockSanityInstance, mockOnSuccess)

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
      expect(mockSetLoggedInState).toHaveBeenCalledWith(LOGGED_IN_STATES.LOADING)
      expect(mockSetSessionId).toHaveBeenCalledWith(mockToken)
      expect(mockSetLoggedInState).toHaveBeenCalledWith(LOGGED_IN_STATES.LOGGED_IN)

      expect(mockOnSuccess).toHaveBeenCalledOnce()
    })

    it('should propagate errors from the client request', async () => {
      const mockError = new Error('Request failed')
      const mockRequest = vi.fn().mockRejectedValue(mockError)

      // Mock the client returned by createClient
      const mockClient = {request: mockRequest} as unknown as SanityClient
      vi.mocked(createClient).mockReturnValue(mockClient)

      await expect(tradeTokenForSession('test-session-id', mockSanityInstance)).rejects.toThrow(
        mockError,
      )
    })
  })
})
