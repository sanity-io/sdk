import {createClient, type SanityClient} from '@sanity/client'
import {beforeEach, describe, expect, vi} from 'vitest'

import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'
import {getSessionStore} from './getSessionStore'
import {LOGGED_IN_STATES, type SessionStore} from './sessionStore'
import {tradeSessionIdForToken} from './tradeSessionIdForToken'

vi.mock('../client/getClient')
vi.mock('./fetchSessionUser')
vi.mock('./getSessionStore')

describe('tradeSessionIdForToken', () => {
  const mockToken = 'test-token-123'
  const mockSanityInstance = {
    projectId: 'test-project',
    config: {
      token: mockToken,
    },
  } as unknown as SanityInstance
  const mockSetLoggedInState = vi.fn()
  const mockSetSessionId = vi.fn()
  const mockSetUser = vi.fn()
  const mockOnSuccess = vi.fn()

  // Mock the @sanity/client module
  vi.mock('@sanity/client', () => ({
    createClient: vi.fn(),
  }))

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getSessionStore).mockReturnValue({
      getState: () => ({
        setLoggedInState: mockSetLoggedInState,
        setSessionId: mockSetSessionId,
        setUser: mockSetUser,
      }),
    } as unknown as SessionStore)

    // Mock the getClient function to return an object with a withConfig method
    vi.mocked(getClient).mockReturnValue({
      withConfig: () => ({
        request: vi.fn().mockResolvedValue({token: mockToken}),
      }),
    } as unknown as SanityClient)
  })

  it('should return undefined if sessionId is empty', async () => {
    const result = await tradeSessionIdForToken('', mockSanityInstance)
    expect(result).toBeUndefined()
  })

  it('should return token when request is successful', async () => {
    const mockRequest = vi.fn().mockResolvedValue({token: mockToken})

    // Mock the client returned by createClient
    const mockClient = {request: mockRequest} as unknown as SanityClient
    vi.mocked(createClient).mockReturnValue(mockClient)

    const sessionId = 'test-session-id'
    const result = await tradeSessionIdForToken(sessionId, mockSanityInstance, mockOnSuccess)

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
    expect(mockSanityInstance.config.token).toBe(mockToken)
    expect(mockSetLoggedInState).toHaveBeenCalledWith(LOGGED_IN_STATES.LOADING)
    expect(mockSetLoggedInState).toHaveBeenCalledWith(LOGGED_IN_STATES.LOGGED_IN)

    expect(mockOnSuccess).toHaveBeenCalledOnce()
  })

  it('should propagate errors from the client request', async () => {
    const mockError = new Error('Request failed')
    const mockRequest = vi.fn().mockRejectedValue(mockError)

    // Mock the client returned by createClient
    const mockClient = {request: mockRequest} as unknown as SanityClient
    vi.mocked(createClient).mockReturnValue(mockClient)

    await expect(tradeSessionIdForToken('test-session-id', mockSanityInstance)).rejects.toThrow(
      mockError,
    )
  })
})
