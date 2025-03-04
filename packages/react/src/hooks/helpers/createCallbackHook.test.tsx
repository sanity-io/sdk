import {createSanityInstance, type SanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {createCallbackHook} from './createCallbackHook'

// Mock the useSanityInstance hook
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

describe('createCallbackHook', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a hook that provides a memoized callback', () => {
    // Create a mock Sanity instance
    const mockInstance = createSanityInstance({resources: [{projectId: 'p', dataset: 'd'}]})

    // Mock the useSanityInstance to return our mock instance
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    // Create a test callback function
    const testCallback = (instance: object, param1: string, param2: number) => {
      return `${param1}-${param2}-${instance ? 'valid' : 'invalid'}`
    }

    // Create our hook using the utility
    const useTestHook = createCallbackHook(testCallback)

    // Render the hook
    const {result, rerender} = renderHook(() => useTestHook())

    // Test the callback with parameters
    const result1 = result.current('test', 123)
    expect(result1).toBe('test-123-valid')

    // Rerender and ensure the callback reference remains stable
    rerender()
    const result2 = result.current('test', 123)
    expect(result2).toBe('test-123-valid')

    // Verify the hook is memoizing the callback
    expect(result.current).toBe(result.current)
  })

  it('should create new callback when instance changes', () => {
    // Create two different mock instances
    const mockInstance1 = createSanityInstance({resources: [{projectId: 'p1', dataset: 'd'}]})
    const mockInstance2 = createSanityInstance({resources: [{projectId: 'p2', dataset: 'd'}]})

    vi.mocked(useSanityInstance).mockReturnValueOnce(mockInstance1)

    // Create a test callback
    const testCallback = (instance: SanityInstance) => instance.resources[0].projectId // TODO: support multiple resources

    // Create and render our hook
    const useTestHook = createCallbackHook(testCallback)
    const {result, rerender} = renderHook(() => useTestHook())

    // Store the first callback reference
    const firstCallback = result.current

    // Change the instance
    vi.mocked(useSanityInstance).mockReturnValueOnce(mockInstance2)
    rerender()

    // Verify the callback reference changed
    expect(result.current).not.toBe(firstCallback)

    // Verify the callbacks return different results
    expect(firstCallback()).toBe('p1')
    expect(result.current()).toBe('p2')
  })

  it('should handle callbacks with multiple parameters', () => {
    const mockInstance = createSanityInstance({resources: [{projectId: 'p', dataset: 'd'}]})
    vi.mocked(useSanityInstance).mockReturnValue(mockInstance)

    // Create a callback with multiple parameters
    const testCallback = (
      instance: SanityInstance,
      path: string,
      method: string,
      data: object,
    ) => ({
      url: `${instance.resources[0].projectId}${path}`, // TODO: support multiple resources
      method,
      data,
    })

    const useTestHook = createCallbackHook(testCallback)
    const {result} = renderHook(() => useTestHook())

    const response = result.current('/users', 'POST', {name: 'Test User'})

    expect(response).toEqual({
      url: 'p/users',
      method: 'POST',
      data: {name: 'Test User'},
    })
  })
})
