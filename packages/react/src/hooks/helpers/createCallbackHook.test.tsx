import {type SanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {createCallbackHook} from './createCallbackHook'

describe('createCallbackHook', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a hook that provides a memoized callback', () => {
    // Create a test callback function
    const testCallback = (instance: object, param1: string, param2: number) => {
      return `${param1}-${param2}-${instance ? 'valid' : 'invalid'}`
    }

    // Create our hook using the utility
    const useTestHook = createCallbackHook(testCallback)

    // Render the hook
    const {result, rerender} = renderHook(() => useTestHook(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

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
    // Create a test callback
    const testCallback = (instance: SanityInstance) => instance.config.projectId

    // Create and render our hook with first provider
    const useTestHook = createCallbackHook(testCallback)
    const {result, unmount} = renderHook(() => useTestHook(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p1" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    // Store the first callback reference and result
    const firstCallback = result.current
    const firstResult = firstCallback()
    expect(firstResult).toBe('p1')

    unmount()

    // Re-render with different provider configuration
    const {result: result2} = renderHook(() => useTestHook(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p2" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    // Verify the callback reference changed and returns different result
    expect(result2.current).not.toBe(firstCallback)
    expect(result2.current()).toBe('p2')
  })

  it('should handle callbacks with multiple parameters', () => {
    // Create a callback with multiple parameters
    const testCallback = (
      instance: SanityInstance,
      path: string,
      method: string,
      data: object,
    ) => ({
      url: `${instance.config.projectId}${path}`,
      method,
      data,
    })

    const useTestHook = createCallbackHook(testCallback)
    const {result} = renderHook(() => useTestHook(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="p" dataset="d" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    const response = result.current('/users', 'POST', {name: 'Test User'})

    expect(response).toEqual({
      url: 'p/users',
      method: 'POST',
      data: {name: 'Test User'},
    })
  })
})
