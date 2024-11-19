import {describe, expect, it} from 'vitest'

import {getSdkIdentity} from './identity'

describe('identity', () => {
  describe('getSdkIdentity', () => {
    it('creates a frozen object with expected properties', () => {
      const identity = getSdkIdentity({
        projectId: 'test-project',
        dataset: 'test-dataset',
      })

      // Check if object is frozen
      expect(Object.isFrozen(identity)).toBe(true)

      // Check if all expected properties exist
      expect(identity).toHaveProperty('id')
      expect(identity).toHaveProperty('projectId', 'test-project')
      expect(identity).toHaveProperty('dataset', 'test-dataset')
    })

    it('generates unique ids for different instances', () => {
      const identity1 = getSdkIdentity({
        projectId: 'test-project',
        dataset: 'test-dataset',
      })

      const identity2 = getSdkIdentity({
        projectId: 'test-project',
        dataset: 'test-dataset',
      })

      expect(identity1.id).not.toBe(identity2.id)
    })

    it('generates id with correct format', () => {
      const identity = getSdkIdentity({
        projectId: 'test-project',
        dataset: 'test-dataset',
      })

      // ID should be 16 characters long (8 pairs of hex digits)
      expect(identity.id).toMatch(/^[0-9a-f]{16}$/)
    })
  })
})
