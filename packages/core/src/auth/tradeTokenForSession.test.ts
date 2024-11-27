import type {SanityClient} from '@sanity/client'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'
import {fetchSessionUser} from './fetchSessionUser'
import {getSessionStore} from './getSessionStore'
import {LOGGED_IN_STATES, type SessionStore} from './sessionStore'
import {tradeTokenForSession} from './tradeTokenForSession'

vi.mock('../client/getClient')
vi.mock('./fetchSessionUser')
vi.mock('./getSessionStore')

describe('tradeTokenForSession', () => {
  const mockSessionId = 'temp_123'
  const mockToken = 'permanent_xyz'
  const mockSanityInstance = {projectId: 'test-project'} as unknown as SanityInstance
  const mockSetLoggedInState = vi.fn()
  const mockSetSessionId = vi.fn()
  const mockOnSuccess = vi.fn()

  const mockClient = {
    request: vi.fn().mockResolvedValue({token: mockToken}),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mocks
    vi.mocked(getClient).mockReturnValue(mockClient as unknown as SanityClient)
    vi.mocked(fetchSessionUser).mockResolvedValue(null)
    vi.mocked(getSessionStore).mockReturnValue({
      getState: () => ({
        setLoggedInState: mockSetLoggedInState,
        setSessionId: mockSetSessionId,
      }),
    } as unknown as SessionStore)
  })

  test('returns undefined if sessionId is empty', async () => {
    const result = await tradeTokenForSession('', mockSanityInstance)
    expect(result).toBeUndefined()
    expect(mockClient.request).not.toHaveBeenCalled()
  })

  test('successfully trades token and updates session state', async () => {
    const result = await tradeTokenForSession(mockSessionId, mockSanityInstance, mockOnSuccess)

    // Verify the token exchange request
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'GET',
      uri: '/auth/fetch',
      query: {sid: mockSessionId},
      tag: 'auth.fetch-token',
    })

    // Verify store updates
    expect(mockSetLoggedInState).toHaveBeenCalledWith(LOGGED_IN_STATES.LOADING)
    expect(mockSetSessionId).toHaveBeenCalledWith(mockToken)
    expect(mockSetLoggedInState).toHaveBeenCalledWith(LOGGED_IN_STATES.LOGGED_IN)

    expect(fetchSessionUser).toHaveBeenCalledWith(mockSanityInstance)
    expect(mockOnSuccess).toHaveBeenCalled()
    expect(result).toBe(mockToken)
  })

  test('handles API errors appropriately', async () => {
    const mockError = new Error('API Error')
    mockClient.request.mockRejectedValueOnce(mockError)

    await expect(tradeTokenForSession(mockSessionId, mockSanityInstance)).rejects.toThrow(mockError)
  })
})
