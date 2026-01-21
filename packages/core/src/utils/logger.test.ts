import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {configureLogging as publicConfigureLogging} from '../config/loggingConfig'
import {
  configureLogging,
  createLogger,
  createTimer,
  getLoggingConfig,
  type LogHandler,
  parseDebugEnvVar,
  resetLogging,
} from './logger'

describe('logger', () => {
  const mockHandler: LogHandler = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }

  beforeEach(() => {
    resetLogging()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetLogging()
  })

  describe('configureLogging', () => {
    it('should configure log level', () => {
      configureLogging({level: 'debug', namespaces: ['*']})
      const config = getLoggingConfig()
      expect(config.level).toBe('debug')
    })

    it('should configure namespaces', () => {
      configureLogging({namespaces: ['auth', 'document']})
      const config = getLoggingConfig()
      expect(config.namespaces).toEqual(['auth', 'document'])
    })

    it('should configure internal logging', () => {
      configureLogging({internal: true})
      const config = getLoggingConfig()
      expect(config.internal).toBe(true)
    })

    it('should configure custom handler', () => {
      configureLogging({handler: mockHandler})
      const config = getLoggingConfig()
      expect(config.handler).toBe(mockHandler)
    })

    it('should log when logging is configured', () => {
      publicConfigureLogging({
        level: 'info',
        namespaces: ['sdk'],
        handler: mockHandler,
      })

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[sdk] Logging configured'),
        expect.objectContaining({
          level: 'info',
          namespaces: ['sdk'],
          internal: false,
          source: 'programmatic',
        }),
      )
    })

    it('should log to console.info when no custom handler is provided', () => {
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      publicConfigureLogging({
        level: 'info',
        namespaces: ['sdk'],
      })

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[sdk] Logging configured'),
        expect.objectContaining({
          level: 'info',
          namespaces: ['sdk'],
          internal: false,
          source: 'programmatic',
        }),
      )

      consoleInfoSpy.mockRestore()
    })
  })

  describe('createLogger', () => {
    it('should create a logger for a namespace', () => {
      const logger = createLogger('auth')
      expect(logger.namespace).toBe('auth')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.trace).toBe('function')
    })

    it('should log at enabled levels', () => {
      configureLogging({
        level: 'info',
        namespaces: ['auth'],
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test message', {foo: 'bar'})

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.objectContaining({foo: 'bar'}),
      )
    })

    it('should not log at disabled levels', () => {
      configureLogging({
        level: 'warn',
        namespaces: ['auth'],
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test message')
      logger.debug('test message')

      expect(mockHandler.info).not.toHaveBeenCalled()
      expect(mockHandler.debug).not.toHaveBeenCalled()
    })

    it('should not log for disabled namespaces', () => {
      configureLogging({
        level: 'info',
        namespaces: ['auth'],
        handler: mockHandler,
      })

      const logger = createLogger('document')
      logger.info('test message')

      expect(mockHandler.info).not.toHaveBeenCalled()
    })

    it('should log for wildcard namespace', () => {
      configureLogging({
        level: 'info',
        namespaces: ['*'],
        handler: mockHandler,
      })

      const authLogger = createLogger('auth')
      const docLogger = createLogger('document')

      authLogger.info('auth message')
      docLogger.info('doc message')

      expect(mockHandler.info).toHaveBeenCalledTimes(2)
    })

    it('should sanitize sensitive data', () => {
      configureLogging({
        level: 'info',
        namespaces: ['auth'],
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test', {token: 'secret123', password: 'pass123'})

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          token: '[REDACTED]',
          password: '[REDACTED]',
        }),
      )
    })

    it('should support child loggers with base context', () => {
      configureLogging({
        level: 'info',
        namespaces: ['auth'],
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      const childLogger = logger.child({userId: '123'})
      childLogger.info('test message', {action: 'login'})

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: '123',
          action: 'login',
        }),
      )
    })

    it('should check if level is enabled', () => {
      configureLogging({
        level: 'info',
        namespaces: ['auth'],
      })

      const logger = createLogger('auth')
      expect(logger.isLevelEnabled('info')).toBe(true)
      expect(logger.isLevelEnabled('debug')).toBe(false)
    })
  })

  describe('log levels', () => {
    it('should respect level hierarchy', () => {
      configureLogging({
        level: 'warn',
        namespaces: ['*'],
        handler: mockHandler,
      })

      const logger = createLogger('core')

      logger.error('error')
      logger.warn('warn')
      logger.info('info')
      logger.debug('debug')
      logger.trace('trace')

      expect(mockHandler.error).toHaveBeenCalled()
      expect(mockHandler.warn).toHaveBeenCalled()
      expect(mockHandler.info).not.toHaveBeenCalled()
      expect(mockHandler.debug).not.toHaveBeenCalled()
      expect(mockHandler.trace).not.toHaveBeenCalled()
    })
  })

  describe('internal logging', () => {
    it('should not log internal messages by default', () => {
      configureLogging({
        level: 'trace',
        namespaces: ['*'],
        internal: false,
        handler: mockHandler,
      })

      const logger = createLogger('store')
      logger.trace('internal message')

      expect(mockHandler.trace).not.toHaveBeenCalled()
    })

    it('should log internal messages when enabled', () => {
      configureLogging({
        level: 'trace',
        namespaces: ['*'],
        internal: true,
        handler: mockHandler,
      })

      const logger = createLogger('store')
      logger.trace('internal message')

      expect(mockHandler.trace).toHaveBeenCalled()
    })
  })

  describe('createTimer', () => {
    it('should measure operation duration', async () => {
      configureLogging({
        level: 'debug',
        namespaces: ['query'],
        handler: mockHandler,
      })

      const timer = createTimer('query', 'fetchQuery')
      await new Promise((resolve) => setTimeout(resolve, 10))
      const duration = timer.end()

      expect(duration).toBeGreaterThanOrEqual(8) // Allow for timing variance
      expect(mockHandler.debug).toHaveBeenCalledWith(
        expect.stringContaining('fetchQuery completed'),
        expect.objectContaining({
          operation: 'fetchQuery',
          duration: expect.any(Number),
        }),
      )
    })

    it('should accept custom message and context', () => {
      configureLogging({
        level: 'debug',
        namespaces: ['query'],
        handler: mockHandler,
      })

      const timer = createTimer('query', 'fetchQuery')
      timer.end('Query fetch succeeded', {queryId: '123'})

      expect(mockHandler.debug).toHaveBeenCalledWith(
        expect.stringContaining('Query fetch succeeded'),
        expect.objectContaining({
          operation: 'fetchQuery',
          queryId: '123',
        }),
      )
    })
  })

  describe('message formatting', () => {
    it('should include timestamp by default', () => {
      configureLogging({
        level: 'info',
        namespaces: ['auth'],
        timestamps: true,
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test')

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/),
        undefined,
      )
    })

    it('should exclude timestamp when disabled', () => {
      configureLogging({
        level: 'info',
        namespaces: ['auth'],
        timestamps: false,
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test')

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.not.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/),
        undefined,
      )
    })

    it('should include log level and namespace', () => {
      configureLogging({
        level: 'info',
        namespaces: ['auth'],
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test message')

      expect(mockHandler.info).toHaveBeenCalledWith(expect.stringContaining('[INFO]'), undefined)
      expect(mockHandler.info).toHaveBeenCalledWith(expect.stringContaining('[auth]'), undefined)
    })
  })

  describe('resetLogging', () => {
    it('should reset to default configuration', () => {
      configureLogging({
        level: 'trace',
        namespaces: ['*'],
        internal: true,
      })

      resetLogging()

      const config = getLoggingConfig()
      expect(config.level).toBe('warn')
      expect(config.namespaces).toEqual([])
      expect(config.internal).toBe(false)
    })
  })

  describe('production environment detection', () => {
    const originalEnv = process.env['NODE_ENV']

    afterEach(() => {
      // Restore original NODE_ENV
      process.env['NODE_ENV'] = originalEnv
      resetLogging()
    })

    it('should disable logging in production by default', () => {
      process.env['NODE_ENV'] = 'production'

      configureLogging({
        level: 'info',
        namespaces: ['*'],
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test message')

      // Should not log in production by default
      expect(mockHandler.info).not.toHaveBeenCalled()
    })

    it('should enable logging in production when enableInProduction is true', () => {
      process.env['NODE_ENV'] = 'production'

      configureLogging({
        level: 'info',
        namespaces: ['*'],
        enableInProduction: true,
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test message')

      // Should log when explicitly enabled
      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [auth] test message'),
        undefined,
      )
    })

    it('should enable logging in non-production environments', () => {
      process.env['NODE_ENV'] = 'development'

      configureLogging({
        level: 'info',
        namespaces: ['*'],
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test message')

      // Should log in development
      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [auth] test message'),
        undefined,
      )
    })

    it('should enable logging when NODE_ENV is not set', () => {
      delete process.env['NODE_ENV']

      configureLogging({
        level: 'info',
        namespaces: ['*'],
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test message')

      // Should log when NODE_ENV is undefined
      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [auth] test message'),
        undefined,
      )
    })

    it('should respect enableInProduction: false in production', () => {
      process.env['NODE_ENV'] = 'production'

      configureLogging({
        level: 'info',
        namespaces: ['*'],
        enableInProduction: false,
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('test message')

      // Should not log when explicitly disabled
      expect(mockHandler.info).not.toHaveBeenCalled()
    })
  })

  describe('parseDebugEnvVar', () => {
    const originalDebug = process.env['DEBUG']

    afterEach(() => {
      // Restore original DEBUG
      if (originalDebug === undefined) {
        delete process.env['DEBUG']
      } else {
        process.env['DEBUG'] = originalDebug
      }
    })

    it('should return null when DEBUG is not set', () => {
      delete process.env['DEBUG']
      expect(parseDebugEnvVar()).toBeNull()
    })

    it('should return null when DEBUG does not include "sanity"', () => {
      process.env['DEBUG'] = 'express:*'
      expect(parseDebugEnvVar()).toBeNull()
    })

    it('should parse DEBUG=sanity:* to enable all namespaces at debug level', () => {
      process.env['DEBUG'] = 'sanity:*'
      const config = parseDebugEnvVar()

      expect(config).toEqual({
        level: 'debug',
        namespaces: ['*'],
      })
    })

    it('should parse DEBUG=sanity to enable all namespaces', () => {
      process.env['DEBUG'] = 'sanity'
      const config = parseDebugEnvVar()

      expect(config).toEqual({
        level: 'debug',
        namespaces: ['*'],
      })
    })

    it('should parse DEBUG=sanity:auth,sanity:document for specific namespaces', () => {
      process.env['DEBUG'] = 'sanity:auth,sanity:document'
      const config = parseDebugEnvVar()

      expect(config).toEqual({
        level: 'debug',
        namespaces: ['auth', 'document'],
      })
    })

    it('should parse DEBUG=sanity:trace:* to enable trace level', () => {
      process.env['DEBUG'] = 'sanity:trace:*'
      const config = parseDebugEnvVar()

      expect(config).toEqual({
        level: 'trace',
        namespaces: ['*'],
      })
    })

    it('should parse DEBUG=sanity:info:auth for custom level with namespace', () => {
      process.env['DEBUG'] = 'sanity:info:auth'
      const config = parseDebugEnvVar()

      expect(config?.level).toBe('info')
    })

    it('should parse DEBUG=sanity:*:internal to enable internal logs', () => {
      process.env['DEBUG'] = 'sanity:*:internal'
      const config = parseDebugEnvVar()

      expect(config).toEqual({
        level: 'debug',
        namespaces: ['*'],
        internal: true,
      })
    })

    it('should handle mixed DEBUG patterns with non-sanity values', () => {
      process.env['DEBUG'] = 'express:*,sanity:auth,other:*'
      const config = parseDebugEnvVar()

      expect(config).toEqual({
        level: 'debug',
        namespaces: ['auth'],
      })
    })

    it('should filter out wildcards from specific namespace list', () => {
      process.env['DEBUG'] = 'sanity:auth,sanity:*'
      const config = parseDebugEnvVar()

      // Should prefer wildcard mode
      expect(config?.namespaces).toContain('*')
    })
  })

  describe('DEBUG environment variable integration', () => {
    const originalDebug = process.env['DEBUG']

    afterEach(() => {
      // Restore original DEBUG
      if (originalDebug === undefined) {
        delete process.env['DEBUG']
      } else {
        process.env['DEBUG'] = originalDebug
      }
      resetLogging()
    })

    it('should apply DEBUG env var configuration to logging', () => {
      process.env['DEBUG'] = 'sanity:*'

      // Simulate what happens on module init
      const envConfig = parseDebugEnvVar()
      if (envConfig) {
        configureLogging({
          ...envConfig,
          handler: mockHandler,
        })
      }

      const logger = createLogger('auth')
      logger.debug('test message')

      expect(mockHandler.debug).toHaveBeenCalled()
    })

    it('should allow programmatic config to override env var', () => {
      process.env['DEBUG'] = 'sanity:*'

      // First apply env var config
      const envConfig = parseDebugEnvVar()
      if (envConfig) {
        configureLogging(envConfig)
      }

      // Then override with programmatic config
      configureLogging({
        level: 'error',
        namespaces: ['auth'],
        handler: mockHandler,
      })

      const config = getLoggingConfig()
      expect(config.level).toBe('error')
      expect(config.namespaces).toEqual(['auth'])
    })
  })

  describe('instance context', () => {
    it('should include instance context in log output', () => {
      configureLogging({
        level: 'info',
        namespaces: ['document'],
        handler: mockHandler,
      })

      const logger = createLogger('document', {
        instanceContext: {
          instanceId: 'abc123def456',
          projectId: 'my-project',
          dataset: 'production',
        },
      })

      logger.info('Document updated')

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[project:my-project]'),
        expect.any(Object),
      )
      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[dataset:production]'),
        expect.any(Object),
      )
      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[instance:abc123de]'), // Truncated to 8 chars
        expect.any(Object),
      )
    })

    it('should work without instance context', () => {
      configureLogging({
        level: 'info',
        namespaces: ['auth'],
        handler: mockHandler,
      })

      const logger = createLogger('auth')
      logger.info('Static operation')

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [auth] Static operation'),
        undefined,
      )
      expect(mockHandler.info).not.toHaveBeenCalledWith(
        expect.stringContaining('[project:'),
        expect.any(Object),
      )
    })

    it('should include partial instance context', () => {
      configureLogging({
        level: 'info',
        namespaces: ['query'],
        handler: mockHandler,
      })

      const logger = createLogger('query', {
        instanceContext: {
          projectId: 'my-project',
          // No dataset or instanceId
        },
      })

      logger.info('Query executed')

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[project:my-project]'),
        expect.any(Object),
      )
      expect(mockHandler.info).not.toHaveBeenCalledWith(
        expect.stringContaining('[dataset:'),
        expect.any(Object),
      )
    })

    it('should return instance context', () => {
      const instanceContext = {
        instanceId: 'test-instance',
        projectId: 'test-project',
        dataset: 'test-dataset',
      }

      const logger = createLogger('auth', {instanceContext})

      expect(logger.getInstanceContext()).toEqual(instanceContext)
    })

    it('should return undefined when no instance context', () => {
      const logger = createLogger('auth')

      expect(logger.getInstanceContext()).toBeUndefined()
    })

    it('should merge instance context with other context', () => {
      configureLogging({
        level: 'info',
        namespaces: ['document'],
        handler: mockHandler,
      })

      const logger = createLogger('document', {
        instanceContext: {
          projectId: 'my-project',
          dataset: 'production',
        },
      })

      logger.info('Document synced', {documentId: 'doc-123', syncTime: 150})

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[project:my-project]'),
        expect.objectContaining({
          documentId: 'doc-123',
          syncTime: 150,
          instanceContext: expect.any(Object),
        }),
      )
    })
  })
})
