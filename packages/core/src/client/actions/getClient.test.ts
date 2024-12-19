import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {createSanityInstance} from '../../instance/sanityInstance'
import {getClient} from './getClient'

let tokenCallback: ((token: string | null, prevToken: string | null) => void) | undefined

vi.mock('../../auth/authStore', () => ({
  getAuthStore: vi.fn(() => {
    return {
      tokenState: {
        subscribe: vi.fn((callback) => {
          tokenCallback = callback
        }),
      },
    }
  }),
}))

describe('getClient', () => {
  const apiVersion = '2024-01-01'

  beforeEach(() => {
    tokenCallback = undefined
    vi.clearAllMocks()
  })

  it('throws error when apiVersion is missing', () => {
    const instance = createSanityInstance(config)
    expect(() => getClient(instance, {})).toThrow('Missing required `apiVersion` option')
  })

  it('creates new client with correct apiVersion', () => {
    const instance = createSanityInstance(config)
    const result = getClient(instance, {apiVersion})
    expect(result.config().apiVersion).toBe(apiVersion)
  })

  it('reuses existing client for same apiVersion', () => {
    const instance = createSanityInstance(config)
    const result1 = getClient(instance, {apiVersion})
    const result2 = getClient(instance, {apiVersion})
    expect(result1).toBe(result2)
  })

  it('preserves client identity after token update', async () => {
    const instance = createSanityInstance(config)

    const client1 = getClient(instance, {apiVersion})

    tokenCallback?.('new-token', null)

    const client2 = getClient(instance, {apiVersion})

    expect(client2.config().token).toBe('new-token')
    expect(client2.config().apiVersion).toBe(apiVersion)
    expect(client2).not.toBe(client1)
    expect(client1.config().token).toBeUndefined()
  })
})
