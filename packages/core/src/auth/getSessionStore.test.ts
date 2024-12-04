import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {getSessionStore} from './getSessionStore'
import {createSessionStore} from './sessionStore'

// Mock dependencies
vi.mock('../instance/sanityInstance', () => ({
  getOrCreateResource: vi.fn(),
}))
vi.mock('./sessionStore', () => ({
  createSessionStore: vi.fn().mockReturnValue({
    setState: vi.fn(),
    getState: vi.fn(),
    subscribe: vi.fn(),
  }),
}))

describe('getSessionStore', () => {
  const mockInstance: SanityInstance = {
    identity: {
      projectId: 'test-project-id',
      dataset: 'test-dataset',
    },
    config: {
      token: 'test-token',
    },
  } as SanityInstance

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getOrCreateResource).mockImplementation((_, __, factory) => factory())
  })

  it('creates a session store with correct configuration', () => {
    const sessionStore = getSessionStore(mockInstance)

    // Verify session store creation
    expect(createSessionStore).toHaveBeenCalled()

    // Verify the returned store shape
    expect(sessionStore).toEqual({
      setState: expect.any(Function),
      getState: expect.any(Function),
      subscribe: expect.any(Function),
    })
  })

  it('uses getOrCreateResource to cache the session store', () => {
    getSessionStore(mockInstance)

    expect(getOrCreateResource).toHaveBeenCalledWith(
      mockInstance,
      'sessionStore',
      expect.any(Function),
    )
  })
})
