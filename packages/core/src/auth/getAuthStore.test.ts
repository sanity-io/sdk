import {describe, expect, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {getAuthStore} from './getAuthStore'

describe('getAuthStore', () => {
  it('returns the same AuthStore instance on subsequent calls for the same instance', () => {
    const instance = createSanityInstance({projectId: 'testProject', dataset: 'testDataset'})
    const storeA = getAuthStore(instance)
    const storeB = getAuthStore(instance)

    expect(storeA).toBe(storeB)
  })
})
