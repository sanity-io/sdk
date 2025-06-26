/* eslint-disable @typescript-eslint/no-explicit-any */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {startIntentListener, stopAllIntentListeners, stopIntentListener} from './intentListener'

describe('intentListener', () => {
  let mockWindow: any
  let mockHistory: any
  let originalPushState: any
  let originalReplaceState: any

  beforeEach(() => {
    // Mock window object
    mockWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: {
        href: 'http://localhost:3000/',
      },
    }
    vi.stubGlobal('window', mockWindow)

    // Mock history object
    originalPushState = vi.fn()
    originalReplaceState = vi.fn()
    mockHistory = {
      pushState: originalPushState,
      replaceState: originalReplaceState,
    }
    vi.stubGlobal('history', mockHistory)
  })

  afterEach(() => {
    stopAllIntentListeners()

    // Restore original history methods
    if (typeof history !== 'undefined') {
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
    }

    vi.unstubAllGlobals()
  })

  describe('startIntentListener', () => {
    it('should not start listener if no intent handlers are defined', () => {
      const instance = createSanityInstance({
        projectId: 'test',
        dataset: 'test',
      })

      // Clear any calls from instance creation
      mockWindow.addEventListener.mockClear()

      const cleanup = startIntentListener(instance)

      expect(mockWindow.addEventListener).not.toHaveBeenCalled()
      expect(typeof cleanup).toBe('function')
    })

    it('should start listener if intent handlers are defined', () => {
      const mockHandler = vi.fn()
      const instance = createSanityInstance({
        projectId: 'test',
        dataset: 'test',
        intentHandlers: {
          testHandler: mockHandler,
        },
      })

      // Clear any calls from instance creation
      mockWindow.addEventListener.mockClear()

      const cleanup = startIntentListener(instance)

      expect(mockWindow.addEventListener).toHaveBeenCalledWith('popstate', expect.any(Function))
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('hashchange', expect.any(Function))
      expect(typeof cleanup).toBe('function')
    })

    it('should intercept history.pushState and history.replaceState', () => {
      const mockHandler = vi.fn()

      // instance automatically starts listener
      createSanityInstance({
        projectId: 'test',
        dataset: 'test',
        intentHandlers: {
          testHandler: mockHandler,
        },
      })

      // Instance automatically starts listener
      expect(history.pushState).not.toBe(originalPushState)
      expect(history.replaceState).not.toBe(originalReplaceState)
    })

    it('should not start listener in non-browser environment', () => {
      vi.stubGlobal('window', undefined)

      const instance = createSanityInstance({
        projectId: 'test',
        dataset: 'test',
        intentHandlers: {
          testHandler: vi.fn(),
        },
      })

      const cleanup = startIntentListener(instance)

      expect(typeof cleanup).toBe('function')
    })

    it('should prevent duplicate listeners for the same instance', () => {
      const mockHandler = vi.fn()
      const instance = createSanityInstance({
        projectId: 'test',
        dataset: 'test',
        intentHandlers: {
          testHandler: mockHandler,
        },
      })

      // Clear any calls from instance creation
      mockWindow.addEventListener.mockClear()

      const cleanup1 = startIntentListener(instance)
      const cleanup2 = startIntentListener(instance)

      // Second call should clean up first listener and create new one
      expect(mockWindow.addEventListener).toHaveBeenCalledTimes(4) // 2 events × 2 calls
      expect(typeof cleanup1).toBe('function')
      expect(typeof cleanup2).toBe('function')
    })
  })

  describe('stopIntentListener', () => {
    it('should stop listener for specific instance', () => {
      const mockHandler = vi.fn()
      const instance = createSanityInstance({
        projectId: 'test',
        dataset: 'test',
        intentHandlers: {
          testHandler: mockHandler,
        },
      })

      // Instance automatically starts listener, so we just need to stop it
      stopIntentListener(instance)

      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function))
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
        'hashchange',
        expect.any(Function),
      )
      expect(history.pushState).toBe(originalPushState)
      expect(history.replaceState).toBe(originalReplaceState)
    })

    it('should handle stopping non-existent listener gracefully', () => {
      const instance = createSanityInstance({
        projectId: 'test',
        dataset: 'test',
      })

      expect(() => stopIntentListener(instance)).not.toThrow()
    })
  })

  describe('stopAllIntentListeners', () => {
    it('should stop all active listeners', () => {
      const mockHandler = vi.fn()

      // Clear any previous calls
      mockWindow.removeEventListener.mockClear()

      createSanityInstance({
        projectId: 'test1',
        dataset: 'test',
        intentHandlers: {testHandler: mockHandler},
      })
      createSanityInstance({
        projectId: 'test2',
        dataset: 'test',
        intentHandlers: {testHandler: mockHandler},
      })

      // Instances automatically start listeners, so we don't need to call startIntentListener explicitly
      stopAllIntentListeners()

      // Should remove listeners (at least 2 events)
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function))
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
        'hashchange',
        expect.any(Function),
      )
    })
  })

  describe('history interception', () => {
    it('should call original pushState and trigger intent check', () => {
      const mockHandler = vi.fn()
      createSanityInstance({
        projectId: 'test',
        dataset: 'test',
        intentHandlers: {
          testHandler: mockHandler,
        },
      })

      // Instance automatically starts listener

      const state = {test: 'data'}
      const title = 'Test Title'
      const url = '/test-url'

      history.pushState(state, title, url)

      expect(originalPushState).toHaveBeenCalledWith(state, title, url)
    })

    it('should call original replaceState and trigger intent check', () => {
      const mockHandler = vi.fn()
      createSanityInstance({
        projectId: 'test',
        dataset: 'test',
        intentHandlers: {
          testHandler: mockHandler,
        },
      })

      // Instance automatically starts listener

      const state = {test: 'data'}
      const title = 'Test Title'
      const url = '/test-url'

      history.replaceState(state, title, url)

      expect(originalReplaceState).toHaveBeenCalledWith(state, title, url)
    })
  })
})
