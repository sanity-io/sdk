import {describe, expect, it} from 'vitest'

import {getSdkResources} from './identity'

describe('identity', () => {
  describe('getSdkResources', () => {
    it('creates a frozen array of resources with expected properties', () => {
      const resources = getSdkResources([
        {
          projectId: 'test-project',
          dataset: 'test-dataset',
        },
      ])

      // Check if object is frozen
      expect(Object.isFrozen(resources)).toBe(true)

      // Check if all expected properties exist
      expect(resources[0]).toHaveProperty('id') // TODO: support multiple resources
      expect(resources[0]).toHaveProperty('projectId', 'test-project')
      expect(resources[0]).toHaveProperty('dataset', 'test-dataset')
    })

    it('generates unique ids for different instances', () => {
      const resources1 = getSdkResources([
        {
          projectId: 'test-project',
          dataset: 'test-dataset',
        },
      ])

      const resources2 = getSdkResources([
        {
          projectId: 'test-project',
          dataset: 'test-dataset',
        },
      ])

      expect(resources1[0].id).not.toBe(resources2[0].id)
    })

    it('generates id with correct format', () => {
      const resources = getSdkResources([
        {
          projectId: 'test-project',
          dataset: 'test-dataset',
        },
      ])

      // ID should be 16 characters long (8 pairs of hex digits)
      expect(resources[0].id).toMatch(/^[0-9a-f]{16}$/)
    })
  })
})
