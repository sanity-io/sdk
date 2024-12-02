import {describe, expect, it, vi} from 'vitest'
import {renderHook} from '@testing-library/react'
import {useLoggedInState} from './useLoggedInState'
import {getSessionStore} from '@sanity/sdk'

// Mock the SDK
vi.mock('@sanity/sdk', () => ({
  getSessionStore: vi.fn(() => ({
    getState: () => ({loggedInState: 'authenticated'}),
    subscribe: vi.fn(),
  })),
}))

describe('useLoggedInState', () => {
  it('should return the logged in state from the session store', () => {
    const mockSanityInstance = {
      config: {},
      identity: {id: '123', projectId: 'test', dataset: 'test'},
    }

    const {result} = renderHook(() => useLoggedInState(mockSanityInstance))

    expect(result.current).toBe('authenticated')
    expect(getSessionStore).toHaveBeenCalledWith(mockSanityInstance)
  })
})
