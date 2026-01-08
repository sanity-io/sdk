import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {configureLogging, type LogHandler, resetLogging} from '../utils/logger'
import {createSanityInstance} from './createSanityInstance'

describe('createSanityInstance', () => {
  it('should create an instance with a unique instanceId and given config', () => {
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    expect(typeof instance.instanceId).toBe('string')
    expect(instance.config).toEqual({projectId: 'proj1', dataset: 'ds1'})
    expect(instance.isDisposed()).toBe(false)
  })

  it('should dispose an instance and call onDispose callbacks', () => {
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    const callback = vi.fn()
    instance.onDispose(callback)
    instance.dispose()
    expect(instance.isDisposed()).toBe(true)
    expect(callback).toHaveBeenCalled()
  })

  it('should not call onDispose callbacks more than once when disposed multiple times', () => {
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    const callback = vi.fn()
    instance.onDispose(callback)
    instance.dispose()
    instance.dispose()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should create a child instance with merged config and correct parent', () => {
    const parent = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    const child = parent.createChild({dataset: 'ds2'})
    expect(child.config).toEqual({projectId: 'proj1', dataset: 'ds2'})
    expect(child.getParent()).toBe(parent)
  })

  it('should match an instance in the hierarchy using match', () => {
    // three-level hierarchy
    const grandparent = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    const parent = grandparent.createChild({projectId: 'proj2'})
    const child = parent.createChild({dataset: 'ds2'})

    expect(child.config).toEqual({projectId: 'proj2', dataset: 'ds2'})
    expect(parent.config).toEqual({projectId: 'proj2', dataset: 'ds1'})

    expect(child.match({dataset: 'ds2'})).toBe(child)
    expect(child.match({projectId: 'proj2'})).toBe(child)
    expect(child.match({projectId: 'proj1'})).toBe(grandparent)
    expect(parent.match({projectId: 'proj1'})).toBe(grandparent)
    expect(grandparent.match({projectId: 'proj1'})).toBe(grandparent)
  })

  it('should match `undefined` when the desired resource ID should not be set on an instance', () => {
    const noProjectOrDataset = createSanityInstance()
    const noDataset = noProjectOrDataset.createChild({projectId: 'proj1'})
    const leaf = noDataset.createChild({dataset: 'ds1'})

    // no keys means anything (in this case, self) will match
    expect(leaf.match({})).toBe(leaf)

    // `[resourceId]: undefined` means match an instance with no dataset set
    expect(leaf.match({dataset: undefined})).toBe(noDataset)
    expect(noDataset.match({dataset: undefined})).toBe(noDataset)
    expect(leaf.match({projectId: undefined})).toBe(noProjectOrDataset)
    expect(noDataset.match({projectId: undefined})).toBe(noProjectOrDataset)
    expect(noProjectOrDataset.match({projectId: undefined})).toBe(noProjectOrDataset)
  })

  it('should return undefined when no match is found', () => {
    const instance = createSanityInstance({projectId: 'proj1', dataset: 'ds1'})
    expect(instance.match({dataset: 'non-existent'})).toBeUndefined()
  })

  it('should inherit and merge auth config', () => {
    const parent = createSanityInstance({
      projectId: 'proj1',
      dataset: 'ds1',
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
      createSanityInstance({projectId: 'test-proj', dataset: 'test-ds'})

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [sdk]'),
        expect.objectContaining({
          hasProjectId: true,
          hasDataset: true,
        }),
      )
    })

    it('should log configuration details at debug level', () => {
      createSanityInstance({projectId: 'test-proj', dataset: 'test-ds'})

      expect(mockHandler.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] [sdk]'),
        expect.objectContaining({
          projectId: 'test-proj',
          dataset: 'test-ds',
        }),
      )
    })

    it('should log instance disposal', () => {
      const instance = createSanityInstance({projectId: 'test-proj'})
      vi.clearAllMocks() // Clear creation logs

      instance.dispose()

      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringContaining('Instance disposed'),
        expect.anything(),
      )
    })

    it('should log child instance creation at debug level', () => {
      const parent = createSanityInstance({projectId: 'parent-proj'})
      vi.clearAllMocks() // Clear parent creation logs

      parent.createChild({dataset: 'child-ds'})

      expect(mockHandler.debug).toHaveBeenCalledWith(
        expect.stringContaining('Creating child instance'),
        expect.objectContaining({
          overridingDataset: true,
        }),
      )
    })

    it('should include instance context in logs', () => {
      const _instance = createSanityInstance({projectId: 'my-project', dataset: 'my-dataset'})

      // Check that logs include the instance context (project and dataset)
      expect(mockHandler.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[project:my-project\].*\[dataset:my-dataset\]/),
        expect.anything(),
      )
    })
  })
})
