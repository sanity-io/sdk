import {createClient, type SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {config} from '../../../../test/fixtures'
import {createSanityInstance} from '../../../instance/sanityInstance'
import {oldCreateClientStore} from '../clientStore'

describe('getClientEvents', () => {
  const API_VERSION = '2024-12-05'
  let defaultClient: SanityClient
  let store: ReturnType<typeof oldCreateClientStore>
  let instance: ReturnType<typeof createSanityInstance>

  beforeEach(() => {
    instance = createSanityInstance(config)
    defaultClient = createClient({...config, apiVersion: API_VERSION, useCdn: false})
    store = oldCreateClientStore(instance, defaultClient)
  })

  it('immediately emits initial client', () => {
    const events = store.getClientEvents({apiVersion: '2024-01-01'})
    const mockNext = vi.fn()

    events.subscribe({next: mockNext})

    expect(mockNext).toHaveBeenCalledTimes(1)
    const emittedClient = mockNext.mock.calls[0][0]
    expect(emittedClient.config().apiVersion).toBe('2024-01-01')
  })

  it('emits new client when store updates token', () => {
    const events = store.getClientEvents({apiVersion: '2024-01-01'})
    const mockNext = vi.fn()

    events.subscribe({next: mockNext})
    store.receiveToken('new-token')

    expect(mockNext).toHaveBeenCalledTimes(2) // Initial + update
    const latestClient = mockNext.mock.calls[1][0]
    expect(latestClient.config().token).toBe('new-token')
    expect(latestClient.config().apiVersion).toBe('2024-01-01')
  })

  it('unsubscribes properly', () => {
    const events = store.getClientEvents({apiVersion: '2024-01-01'})
    const mockNext = vi.fn()

    const subscription = events.subscribe({next: mockNext})
    subscription.unsubscribe()

    store.receiveToken('new-token')

    // Should only have the initial emission
    expect(mockNext).toHaveBeenCalledTimes(1)
  })

  it('throws error when apiVersion is missing', () => {
    expect(() => store.getClientEvents({})).toThrow('Missing required `apiVersion` option')
  })

  it('maintains apiVersion through updates', () => {
    const events = store.getClientEvents({apiVersion: '2024-01-01'})
    const mockNext = vi.fn()

    events.subscribe({next: mockNext})
    store.receiveToken('token1')
    store.receiveToken('token2')

    expect(mockNext).toHaveBeenCalledTimes(3) // Initial + 2 updates
    mockNext.mock.calls.forEach(([client]) => {
      expect(client.config().apiVersion).toBe('2024-01-01')
    })
  })

  it('handles multiple subscribers independently', () => {
    const events1 = store.getClientEvents({apiVersion: '2024-01-01'})
    const events2 = store.getClientEvents({apiVersion: '2024-02-01'})
    const mockNext1 = vi.fn()
    const mockNext2 = vi.fn()

    events1.subscribe({next: mockNext1})
    events2.subscribe({next: mockNext2})
    store.receiveToken('new-token')

    expect(mockNext1).toHaveBeenCalledTimes(2) // Initial + update
    expect(mockNext2).toHaveBeenCalledTimes(2) // Initial + update

    const latestClient1 = mockNext1.mock.calls[1][0]
    const latestClient2 = mockNext2.mock.calls[1][0]
    expect(latestClient1.config().apiVersion).toBe('2024-01-01')
    expect(latestClient2.config().apiVersion).toBe('2024-02-01')
    expect(latestClient1.config().token).toBe('new-token')
    expect(latestClient2.config().token).toBe('new-token')
  })
})
