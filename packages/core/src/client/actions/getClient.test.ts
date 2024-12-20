import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {getAuthStore} from '../../auth/authStore'
import {createSanityInstance} from '../../instance/sanityInstance'
import type {SanityInstance} from '../../instance/types'
import {getClient} from './getClient'

type TokenState = ReturnType<typeof getAuthStore>['tokenState']

vi.mock('../../auth/authStore', () => ({
  getAuthStore: vi.fn().mockReturnValue({
    tokenState: {getState: vi.fn(), subscribe: vi.fn()},
  }),
}))

describe('getClient', () => {
  const apiVersion = '2024-01-01'
  let instance: SanityInstance

  let getState: Mock<TokenState['getState']>
  let subscribe: Mock<TokenState['subscribe']>

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance(config)

    const {tokenState} = getAuthStore(instance)
    getState = vi.mocked(tokenState.getState)
    subscribe = vi.mocked(tokenState.subscribe)
  })

  it('throws error when apiVersion is missing', () => {
    expect(() => getClient(instance, {})).toThrow('Missing required `apiVersion` option')
  })

  it('creates new client with correct apiVersion', () => {
    const result = getClient(instance, {apiVersion})
    expect(result.config().apiVersion).toBe(apiVersion)
  })

  it('reuses existing client for same apiVersion', () => {
    const result1 = getClient(instance, {apiVersion})
    const result2 = getClient(instance, {apiVersion})
    expect(result1).toBe(result2)
  })

  it('preserves client identity after token update', async () => {
    const client1 = getClient(instance, {apiVersion})

    expect(subscribe).toHaveBeenCalledTimes(1)
    const [subscriber] = subscribe.mock.calls[0]

    getState.mockReturnValue('new-token')
    subscriber('new-token', null)

    const client2 = getClient(instance, {apiVersion})

    expect(client2.config().token).toBe('new-token')
    expect(client2.config().apiVersion).toBe(apiVersion)
    expect(client2).not.toBe(client1)
    expect(client1.config().token).toBeUndefined()
  })
})
