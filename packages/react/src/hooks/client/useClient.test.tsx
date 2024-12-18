import {type SanityClient} from '@sanity/client'
import {act} from '@testing-library/react'
import type {Subscribable, Subscriber} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useClient} from './useClient'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getClient: vi.fn(),
    getSubscribableClient: vi.fn(),
  }
})

const {getClient, getSubscribableClient} = await import('@sanity/sdk')

describe('useClient', () => {
  let subscribers: {next: (client: SanityClient) => void}[] = []
  let currentClient: SanityClient

  beforeEach(() => {
    subscribers = []

    currentClient = {
      config: () => ({token: undefined, apiVersion: 'v2024-11-12'}),
    } as unknown as SanityClient

    // Create a subscribable interface directly
    const createSubscribable = (): Subscribable<SanityClient> => ({
      subscribe: (subscriber: {next: (client: SanityClient) => void}) => {
        subscribers.push(subscriber)
        subscriber.next(currentClient)
        return {
          unsubscribe: () => {
            const index = subscribers.indexOf(subscriber)
            if (index > -1) subscribers.splice(index, 1)
          },
        }
      },
    })

    vi.mocked(getClient).mockReturnValue(currentClient)
    vi.mocked(getSubscribableClient).mockImplementation(() => createSubscribable())
  })
  it('should return initial client', () => {
    const {result} = renderHook(() => useClient({apiVersion: 'v2024-11-12'}))

    expect(result.current.config().token).toBeUndefined()
    expect(result.current.config().apiVersion).toBe('v2024-11-12')
  })

  it('should handle client update through authentication changes', async () => {
    let clientSubscriber: Subscriber<SanityClient> | undefined

    // Create a subscribable that can simulate updates
    vi.mocked(getSubscribableClient).mockImplementation(() => ({
      subscribe: (subscriber: Subscriber<SanityClient>) => {
        clientSubscriber = subscriber
        // Send initial client
        subscriber.next(currentClient)
        return {
          unsubscribe: vi.fn(),
        }
      },
    }))

    const {result} = renderHook(() => useClient({apiVersion: 'v2024-11-12'}))

    // Verify initial state
    expect(result.current.config().token).toBeUndefined()
    expect(clientSubscriber).toBeDefined()

    // Create authenticated client
    const authenticatedClient = {
      config: () => ({token: 'auth-token', apiVersion: 'v2024-11-12'}),
    } as unknown as SanityClient

    // Update getClient to return the new client
    vi.mocked(getClient).mockReturnValue(authenticatedClient)

    // Simulate the client update that would happen after auth change
    await act(async () => {
      clientSubscriber!.next(authenticatedClient)
    })

    // Verify the client was updated with the new token
    expect(result.current.config().token).toBe('auth-token')
  })

  it('should unsubscribe on unmount', () => {
    const unsubscribeSpy = vi.fn()
    vi.mocked(getSubscribableClient).mockImplementation(() => ({
      subscribe: () => ({
        unsubscribe: unsubscribeSpy,
      }),
    }))

    const {unmount} = renderHook(() => useClient({apiVersion: 'v2024-11-12'}))

    unmount()
    expect(unsubscribeSpy).toHaveBeenCalled()
  })

  it('should handle subscription errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const testError = new Error('Subscription error')
    let errorSubscriber: Subscriber<SanityClient> | undefined

    // Mock getSubscribableClient to create a subscription that will error
    vi.mocked(getSubscribableClient).mockImplementation(() => ({
      subscribe: (subscriber: Subscriber<SanityClient>) => {
        errorSubscriber = subscriber
        return {
          unsubscribe: vi.fn(),
        }
      },
    }))

    renderHook(() => useClient({apiVersion: 'v2024-11-12'}))

    errorSubscriber!.error(testError)

    // eslint-disable-next-line no-console
    expect(console.error).toHaveBeenCalledWith('Error in useClient subscription:', testError)
  })
})
