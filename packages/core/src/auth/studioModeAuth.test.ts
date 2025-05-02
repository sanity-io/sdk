import {type SanityClient} from '@sanity/client'
import {describe, expect, it, type MockInstance, vi} from 'vitest'

import {checkForCookieAuth, getStudioTokenFromLocalStorage} from './studioModeAuth'
import * as utils from './utils'

describe('checkForCookieAuth', () => {
  it('should return false if projectId is undefined', async () => {
    const clientFactory = vi.fn()
    const result = await checkForCookieAuth(undefined, clientFactory)
    expect(result).toBe(false)
    expect(clientFactory).not.toHaveBeenCalled()
  })

  it('should call clientFactory with projectId', async () => {
    const projectId = 'test-project'
    const mockClient = {
      request: vi.fn().mockResolvedValue({id: 'user-id'}),
    } as unknown as SanityClient
    const clientFactory = vi.fn().mockReturnValue(mockClient)

    await checkForCookieAuth(projectId, clientFactory)

    expect(clientFactory).toHaveBeenCalledWith({projectId, useCdn: false})
  })

  it('should return true if client request returns a user with id', async () => {
    const projectId = 'test-project'
    const mockClient = {
      request: vi.fn().mockResolvedValue({id: 'user-id'}),
    } as unknown as SanityClient
    const clientFactory = vi.fn().mockReturnValue(mockClient)

    const result = await checkForCookieAuth(projectId, clientFactory)

    expect(result).toBe(true)
    expect(mockClient.request).toHaveBeenCalledWith({
      uri: '/users/me',
      withCredentials: true,
      tag: 'users.get-current',
    })
  })

  it('should return false if client request fails', async () => {
    const projectId = 'test-project'
    const mockClient = {
      request: vi.fn().mockRejectedValue(new Error('Request failed')),
    } as unknown as SanityClient
    const clientFactory = vi.fn().mockReturnValue(mockClient)

    const result = await checkForCookieAuth(projectId, clientFactory)

    expect(result).toBe(false)
  })

  it('should return false if client request returns user without id', async () => {
    const projectId = 'test-project'
    const mockClient = {
      request: vi.fn().mockResolvedValue({name: 'Test User'}), // No id
    } as unknown as SanityClient
    const clientFactory = vi.fn().mockReturnValue(mockClient)

    const result = await checkForCookieAuth(projectId, clientFactory)

    expect(result).toBe(false)
  })
})

describe('getStudioTokenFromLocalStorage', () => {
  const storageArea = {} as Storage // Mock storage, specifics depend on utils.getTokenFromStorage
  const projectId = 'test-project'
  const studioStorageKey = `__studio_auth_token_${projectId}`
  const mockToken = 'mock-auth-token'

  // Define the function signature type
  type GetTokenFromStorageFn = (
    _storageArea: Storage | undefined,
    _storageKey: string,
  ) => string | null
  // Declare the spy using the function signature type
  let getTokenFromStorageSpy: MockInstance<GetTokenFromStorageFn>

  beforeEach(() => {
    // Spy on the imported utility function
    getTokenFromStorageSpy = vi.spyOn(utils, 'getTokenFromStorage')
  })

  afterEach(() => {
    // Restore the original implementation after each test
    getTokenFromStorageSpy.mockRestore()
  })

  it('should return null if storageArea is undefined', () => {
    const result = getStudioTokenFromLocalStorage(undefined, projectId)
    expect(result).toBeNull()
    expect(getTokenFromStorageSpy).not.toHaveBeenCalled()
  })

  it('should return null if projectId is undefined', () => {
    const result = getStudioTokenFromLocalStorage(storageArea, undefined)
    expect(result).toBeNull()
    expect(getTokenFromStorageSpy).not.toHaveBeenCalled()
  })

  it('should call getTokenFromStorage with correct key', () => {
    getTokenFromStorageSpy.mockReturnValue(null) // Assume token not found for this test
    getStudioTokenFromLocalStorage(storageArea, projectId)
    expect(getTokenFromStorageSpy).toHaveBeenCalledWith(storageArea, studioStorageKey)
  })

  it('should return the token if found in storage', () => {
    getTokenFromStorageSpy.mockReturnValue(mockToken)
    const result = getStudioTokenFromLocalStorage(storageArea, projectId)
    expect(result).toBe(mockToken)
  })

  it('should return null if token is not found in storage', () => {
    getTokenFromStorageSpy.mockReturnValue(null)
    const result = getStudioTokenFromLocalStorage(storageArea, projectId)
    expect(result).toBeNull()
  })
})
