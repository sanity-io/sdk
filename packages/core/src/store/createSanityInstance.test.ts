import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {configureLogging, type LogHandler, resetLogging} from '../utils/logger'
import {createSanityInstance} from './createSanityInstance'

describe('createSanityInstance', () => {
  it('should create an instance with a unique instanceId and given config', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'proj1', dataset: 'ds1'}},
    })
    expect(typeof instance.instanceId).toBe('string')
    expect(instance.config).toEqual({sources: {default: {projectId: 'proj1', dataset: 'ds1'}}})
    expect(instance.isDisposed()).toBe(false)
  })

  it('should dispose an instance and call onDispose callbacks', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'proj1', dataset: 'ds1'}},
    })
    const callback = vi.fn()
    instance.onDispose(callback)
    instance.dispose()
    expect(instance.isDisposed()).toBe(true)
    expect(callback).toHaveBeenCalled()
  })

  it('should not call onDispose callbacks more than once when disposed multiple times', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'proj1', dataset: 'ds1'}},
    })
    const callback = vi.fn()
    instance.onDispose(callback)
    instance.dispose()
    instance.dispose()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should create a child instance with merged config and correct parent', () => {
    const parent = createSanityInstance({sources: {default: {projectId: 'proj1', dataset: 'ds1'}}})
    const child = parent.createChild({sources: {default: {projectId: 'proj1', dataset: 'ds2'}}})
    expect(child.config).toEqual({sources: {default: {projectId: 'proj1', dataset: 'ds2'}}})
    expect(child.getParent()).toBe(parent)
  })

  it('should match an instance in the hierarchy using match', () => {
    // three-level hierarchy
    const grandparent = createSanityInstance({
      sources: {default: {projectId: 'proj1', dataset: 'ds1'}},
    })
    const parent = grandparent.createChild({
      sources: {default: {projectId: 'proj2', dataset: 'ds1'}},
    })
    const child = parent.createChild({sources: {default: {projectId: 'proj2', dataset: 'ds2'}}})

    expect(child.config).toEqual({sources: {default: {projectId: 'proj2', dataset: 'ds2'}}})
    expect(parent.config).toEqual({sources: {default: {projectId: 'proj2', dataset: 'ds1'}}})

    // match() compares auth - with no auth config, empty target matches current instance
    expect(child.match({})).toBe(child)
  })

  it('should support createChild with incremental source config', () => {
    const empty = createSanityInstance()
    const withSource = empty.createChild({
      sources: {default: {projectId: 'proj1', dataset: 'ds1'}},
    })

    expect(empty.config).toEqual({})
    expect(withSource.config).toEqual({sources: {default: {projectId: 'proj1', dataset: 'ds1'}}})

    expect(withSource.match({})).toBe(withSource)
  })

  it('should return undefined when no match is found', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'proj1', dataset: 'ds1'}},
    })
    // match() only compares auth - no instance has auth: {apiHost: 'nonexistent'}
    expect(instance.match({auth: {apiHost: 'nonexistent'}})).toBeUndefined()
  })

  it('should inherit and merge auth config', () => {
    const parent = createSanityInstance({
      sources: {default: {projectId: 'proj1', dataset: 'ds1'}},
      auth: {apiHost: 'api.sanity.work'},
    })
    const child = parent.createChild({auth: {token: 'my-token'}})
    expect(child.config.auth).toEqual({apiHost: 'api.sanity.work', token: 'my-token'})
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
      createSanityInstance({sources: {default: {projectId: 'test-proj', dataset: 'test-ds'}}})

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [sdk]'),
        expect.objectContaining({
          hasProjectId: true,
          hasSources: true,
        }),
      )
    })

    it('should log configuration details at debug level', () => {
      createSanityInstance({sources: {default: {projectId: 'test-proj', dataset: 'test-ds'}}})

      expect(mockHandler.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] [sdk]'),
        expect.objectContaining({
          projectId: 'test-proj',
          sourceNames: ['default'],
        }),
      )
    })

    it('should log instance disposal', () => {
      const instance = createSanityInstance({
        sources: {default: {projectId: 'test-proj', dataset: 'ds'}},
      })
      vi.clearAllMocks() // Clear creation logs

      instance.dispose()

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('Instance disposed'),
        expect.anything(),
      )
    })

    it('should log child instance creation at debug level', () => {
      const parent = createSanityInstance({
        sources: {default: {projectId: 'parent-proj', dataset: 'ds'}},
      })
      vi.clearAllMocks() // Clear parent creation logs

      parent.createChild({sources: {default: {projectId: 'parent-proj', dataset: 'child-ds'}}})

      expect(mockHandler.debug).toHaveBeenCalledWith(
        expect.stringContaining('Creating child instance'),
        expect.objectContaining({
          overridingSources: true,
        }),
      )
    })

    it('should include instance context in logs', () => {
      createSanityInstance({sources: {default: {projectId: 'my-project', dataset: 'my-dataset'}}})

      // Check that logs include the instance context (projectId from default source)
      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[project:my-project\]/),
        expect.anything(),
      )
    })
  })
})
