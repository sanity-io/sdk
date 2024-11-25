import {beforeEach, describe, expect, test} from 'vitest'

import {createSanityInstance, getOrCreateResource, type SanityConfig} from './sanityInstance'

describe('sanityInstance', () => {
  let config: SanityConfig

  beforeEach(() => {
    config = {
      projectId: 'test-project',
      dataset: 'test-dataset',
      token: 'test-token',
    }
  })

  describe('createSanityInstance', () => {
    test('creates instance with correct configuration', () => {
      const instance = createSanityInstance(config)

      expect(instance.config.token).toBe('test-token')
      expect(instance.identity).toEqual(
        expect.objectContaining({
          projectId: 'test-project',
          dataset: 'test-dataset',
        }),
      )
    })

    test('handles missing token', () => {
      const {token: _, ...configWithoutToken} = config
      const instance = createSanityInstance(configWithoutToken)

      expect(instance.config.token).toBeUndefined()
    })
  })

  describe('getOrCreateResource', () => {
    test('creates and caches resource', () => {
      const instance = createSanityInstance(config)
      let createCount = 0

      const creator = () => {
        createCount++
        return {value: 'test-resource'}
      }

      // First call should create new resource
      const resource1 = getOrCreateResource(instance, 'test-key', creator)
      expect(resource1).toEqual({value: 'test-resource'})
      expect(createCount).toBe(1)

      // Second call should return cached resource
      const resource2 = getOrCreateResource(instance, 'test-key', creator)
      expect(resource2).toBe(resource1)
      expect(createCount).toBe(1)
    })

    test('different instances have separate resource caches', () => {
      const instance1 = createSanityInstance({...config, projectId: 'project1'})
      const instance2 = createSanityInstance({...config, projectId: 'project2'})
      let createCount = 0

      const creator = () => {
        createCount++
        return {value: 'test-resource'}
      }

      const resource1 = getOrCreateResource(instance1, 'test-key', creator)
      const resource2 = getOrCreateResource(instance2, 'test-key', creator)

      expect(resource1).not.toBe(resource2)
      expect(createCount).toBe(2)
    })
  })
})
