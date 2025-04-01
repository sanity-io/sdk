import {createClient, type SanityClient} from '@sanity/client'
import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getTokenState} from '../auth/authStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {getClient, getClientState} from './clientStore'

// Mock dependencies
vi.mock('@sanity/client')

vi.mock('../auth/authStore')

let instance: SanityInstance

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getTokenState).mockReturnValue({
    getCurrent: vi.fn().mockReturnValue('initial-token'),
    subscribe: vi.fn(),
    observable: new Subject(),
  })
  vi.mocked(createClient).mockImplementation(
    (clientConfig) => ({config: () => clientConfig}) as SanityClient,
  )
  instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})
})

afterEach(() => {
  instance.dispose()
})

describe('clientStore', () => {
  describe('getClient', () => {
    it('should create a client with default configuration', () => {
      const client = getClient(instance, {apiVersion: '2024-11-12'})

      const defaultConfiguration = {
        useCdn: false,
        ignoreBrowserTokenWarning: true,
        allowReconfigure: false,
        requestTagPrefix: 'sanity.sdk',
        projectId: 'test-project',
        dataset: 'test-dataset',
        token: 'initial-token',
      }

      expect(vi.mocked(createClient)).toHaveBeenCalledWith({
        ...defaultConfiguration,
        apiVersion: '2024-11-12',
      })
      expect(client.config()).toEqual({
        ...defaultConfiguration,
        apiVersion: '2024-11-12',
      })
    })

    it('should throw when using disallowed configuration keys', () => {
      expect(() =>
        getClient(instance, {
          apiVersion: '2024-11-12',
          // @ts-expect-error Testing invalid key
          illegalKey: 'foo',
        }),
      ).toThrowError(/unsupported properties: illegalKey/)
    })

    it('should reuse clients with identical configurations', () => {
      const options = {apiVersion: '2024-11-12', useCdn: true}
      const client1 = getClient(instance, options)
      const client2 = getClient(instance, options)

      expect(client1).toBe(client2)
      expect(vi.mocked(createClient)).toHaveBeenCalledTimes(1)
    })

    it('should create new clients when configuration changes', () => {
      const client1 = getClient(instance, {apiVersion: '2024-11-12'})
      const client2 = getClient(instance, {apiVersion: '2023-08-01'})

      expect(client1).not.toBe(client2)
      expect(vi.mocked(createClient)).toHaveBeenCalledTimes(2)
    })
  })

  describe('token handling', () => {
    it('should reset clients when token changes', () => {
      // Initial client with first token
      const tokenState = getTokenState(instance)
      vi.mocked(tokenState.getCurrent).mockReturnValue('first-token')
      const client1 = getClient(instance, {apiVersion: '2024-11-12'})

      // Simulate token change
      vi.mocked(tokenState.getCurrent).mockReturnValue('new-token')
      const token$ = tokenState.observable as Subject<string>
      token$.next('new-token')

      // New client should be created with new token
      const client2 = getClient(instance, {apiVersion: '2024-11-12'})

      expect(client1).not.toBe(client2)
      expect(vi.mocked(createClient)).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'new-token',
        }),
      )
    })
  })

  describe('getClientState', () => {
    it('should provide a state source that emits client changes', async () => {
      // Get initial client state with a specific configuration
      const state = getClientState(instance, {apiVersion: '2024-11-12'})

      // Get initial client
      const initialClient = state.getCurrent()
      expect(initialClient).toBeDefined()

      // Setup a spy to track emissions from the observable
      const nextSpy = vi.fn()
      const subscription = state.observable.subscribe(nextSpy)

      // Should have emitted once initially
      expect(nextSpy).toHaveBeenCalledTimes(1)
      expect(nextSpy).toHaveBeenCalledWith(initialClient)

      // Simulate token change
      const tokenState = getTokenState(instance)
      vi.mocked(tokenState.getCurrent).mockReturnValue('updated-token')
      const token$ = tokenState.observable as Subject<string>
      token$.next('updated-token')

      // Should emit a new client instance
      expect(nextSpy).toHaveBeenCalledTimes(2)

      // The new client should be different from the initial one
      const updatedClient = nextSpy.mock.calls[1][0]
      expect(updatedClient).not.toBe(initialClient)

      // The updated client should have the new token
      expect(updatedClient.config()).toEqual(
        expect.objectContaining({
          token: 'updated-token',
        }),
      )

      // Clean up subscription
      subscription.unsubscribe()
    })
  })
})
