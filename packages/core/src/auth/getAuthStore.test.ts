import {describe, expect, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {getInternalAuthStore} from './getInternalAuthStore'

describe('getAuthStore', () => {
  it('returns the same AuthStore instance on subsequent calls for the same instance', () => {
    const instance = createSanityInstance({projectId: 'testProject', dataset: 'testDataset'})
    const storeA = getInternalAuthStore(instance)
    const storeB = getInternalAuthStore(instance)

    expect(storeA).toBe(storeB)
  })
})
