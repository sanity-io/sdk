import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {configureLogging, type LogHandler, resetLogging} from '../utils/logger'
import {createSanityInstance} from './createSanityInstance'

describe('createSanityInstance', () => {
  it('should create an instance with a unique instanceId and given config', () => {
    const instance = createSanityInstance()
    expect(typeof instance.instanceId).toBe('string')
    expect(instance.config).toEqual({})
    expect(instance.isDisposed()).toBe(false)
  })

  it('should dispose an instance and call onDispose callbacks', () => {
    const instance = createSanityInstance()
    const callback = vi.fn()
    instance.onDispose(callback)
    instance.dispose()
    expect(instance.isDisposed()).toBe(true)
    expect(callback).toHaveBeenCalled()
  })

  it('should not call onDispose callbacks more than once when disposed multiple times', () => {
    const instance = createSanityInstance()
    const callback = vi.fn()
    instance.onDispose(callback)
    instance.dispose()
    instance.dispose()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  describe('logging', () => {
    const mockHandler: LogHandler = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    }

    beforeEach(() => {
      vi.clearAllMocks()
      configureLogging({
        level: 'debug',
        namespaces: ['sdk'],
        handler: mockHandler,
      })
    })

    afterEach(() => {
      resetLogging()
    })

    it('should log instance creation at info level', () => {
      createSanityInstance()

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [sdk]'),
        expect.objectContaining({
          hasAuth: false,
          hasPerspective: false,
        }),
      )
    })

    it('should log configuration details at debug level', () => {
      createSanityInstance({auth: {projectId: 'test-proj'}})

      expect(mockHandler.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] [sdk]'),
        expect.objectContaining({
          hasStudioConfig: false,
        }),
      )
    })

    it('should log instance disposal', () => {
      const instance = createSanityInstance()
      vi.clearAllMocks() // Clear creation logs

      instance.dispose()

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('Instance disposed'),
        expect.anything(),
      )
    })

    it('should include instance id in logs', () => {
      createSanityInstance()

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[instance:/),
        expect.anything(),
      )
    })
  })
})
