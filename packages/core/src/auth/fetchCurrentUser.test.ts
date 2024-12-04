import type {SanityClient} from '@sanity/client'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'
import {fetchCurrentUser} from './fetchCurrentUser'
import {getSessionStore} from './getSessionStore'
import type {SessionStore} from './sessionStore'

// Mock dependencies
vi.mock('../client/getClient')
vi.mock('./getSessionStore')

describe('fetchCurrentUser', () => {
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
      token: 'test-token',
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
    } as unknown as SanityClient)

    // Mock getSessionStore
    vi.mocked(getSessionStore).mockReturnValue({
      getState: () => ({
        setUser: mockSetUser,
      }),
    } as unknown as SessionStore)

    // Mock successful user request
    mockRequest.mockResolvedValue(mockUser)
  })

  it('fetches user with token from store when not provided', async () => {
    const result = await fetchCurrentUser(mockSanityInstance)

    expect(getClient).toHaveBeenCalledWith({apiVersion: 'v2024-11-22'}, mockSanityInstance)
    expect(mockWithConfig).toHaveBeenCalledWith({token: 'test-token'})
    expect(mockRequest).toHaveBeenCalledWith({
      method: 'GET',
      uri: '/users/me',
    })
    expect(result).toEqual(mockUser)
    expect(mockSetUser).toHaveBeenCalledWith(mockUser)
  })

  it('throws error when token is not set in instance', async () => {
    const instanceWithoutToken = {...mockSanityInstance, config: {}} as SanityInstance
    await expect(fetchCurrentUser(instanceWithoutToken)).rejects.toThrow(
      'No token is set for this instance',
    )
  })
})
