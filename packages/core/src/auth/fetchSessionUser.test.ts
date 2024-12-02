import {describe, expect, it, vi, beforeEach} from 'vitest'
import {fetchSessionUser} from './fetchSessionUser'
import {getClient} from '../client/getClient'
import {getSessionStore} from './getSessionStore'
import type {SanityInstance} from '../instance/types'

// Mock dependencies
vi.mock('../client/getClient')
vi.mock('./getSessionStore')

describe('fetchSessionUser', () => {
  const mockUser = {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    role: 'administrator',
  }

  const mockSanityInstance = {
    config: {
      apiHost: 'https://api.sanity.io',
      projectId: 'test-project',
      dataset: 'test-dataset',
    },
    identity: {
      id: 'mock-identity',
      projectId: 'test-project',
      dataset: 'test-dataset',
    },
  } as SanityInstance

  const mockRequest = vi.fn()
  const mockWithConfig = vi.fn().mockReturnValue({request: mockRequest})
  const mockSetUser = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock getClient
    vi.mocked(getClient).mockReturnValue({
      withConfig: mockWithConfig,
    } as any)

    // Mock getSessionStore
    vi.mocked(getSessionStore).mockReturnValue({
      getState: () => ({
        sessionId: 'test-session-id',
        setUser: mockSetUser,
      }),
    } as any)

    // Mock successful user request
    mockRequest.mockResolvedValue(mockUser)
  })

  it('fetches user with session ID from store when not provided', async () => {
    const result = await fetchSessionUser(mockSanityInstance)

    expect(getClient).toHaveBeenCalledWith({apiVersion: 'v2024-11-22'}, mockSanityInstance)
    expect(mockWithConfig).toHaveBeenCalledWith({token: 'test-session-id'})
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      uri: '/users/me',
    })
    expect(result).toEqual(mockUser)
    expect(mockSetUser).toHaveBeenCalledWith(mockUser)
  })

  it('fetches user with provided session ID', async () => {
    const customSessionId = 'custom-session-id'
    const result = await fetchSessionUser(mockSanityInstance, customSessionId)

    expect(mockWithConfig).toHaveBeenCalledWith({token: customSessionId})
    expect(result).toEqual(mockUser)
    expect(mockSetUser).toHaveBeenCalledWith(mockUser)
  })

  it('handles API errors', async () => {
    mockRequest.mockRejectedValue(new Error('API Error'))

    await expect(fetchSessionUser(mockSanityInstance)).rejects.toThrow('API Error')
  })
})
