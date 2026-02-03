import * as sanityClient from '@sanity/client'
import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getAuthMethodState, getTokenState} from '../auth/authStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {getClient, getClientState} from './clientStore'

// Mock dependencies
vi.mock('@sanity/client')

vi.mock('../auth/authStore')

const createClientSpy = vi.spyOn(sanityClient, 'createClient')

let instance: SanityInstance
let authMethod$: Subject<'cookie' | 'localstorage' | undefined>
beforeEach(() => {
  vi.resetAllMocks()

  // Initialize Subjects ONCE per test run before mocks use them
  authMethod$ = new Subject<'cookie' | 'localstorage' | undefined>()

  vi.mocked(getTokenState).mockReturnValue({
    getCurrent: vi.fn().mockReturnValue('initial-token'),
    subscribe: vi.fn(),
    observable: new Subject(),
  })
  vi.mocked(getAuthMethodState).mockReturnValue({
    // Mock initial state value if needed by other parts of setup
    getCurrent: vi.fn().mockReturnValue(undefined),
    subscribe: vi.fn(),
    observable: authMethod$, // Consistently return the module-scope Subject
  })

  instance = createSanityInstance({
    projectId: 'test-project',
    dataset: 'test-dataset',
  })
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
        resource: {type: 'dataset', id: 'test-project.test-dataset'},
        token: 'initial-token',
        useProjectHostname: false,
      }

      expect(createClientSpy).toHaveBeenCalledWith({
        ...defaultConfiguration,
        apiVersion: '2024-11-12',
      })

      expect(client.config()).toMatchObject({
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

    it('should throw a helpful error when called without options', () => {
      expect(() =>
        // @ts-expect-error Testing missing options
        getClient(instance, undefined),
      ).toThrowError(/requires a configuration object with at least an "apiVersion" property/)
    })

    it('should throw a helpful error when called with null options', () => {
      expect(() =>
        // @ts-expect-error Testing null options
        getClient(instance, null),
      ).toThrowError(/requires a configuration object with at least an "apiVersion" property/)
    })

    it('should reuse clients with identical configurations', () => {
      const options = {apiVersion: '2024-11-12', useCdn: true}
      const client1 = getClient(instance, options)
      const client2 = getClient(instance, options)

      expect(client1).toBe(client2)
      expect(createClientSpy).toHaveBeenCalledTimes(1)
    })

    it('should create new clients when configuration changes', () => {
      const client1 = getClient(instance, {apiVersion: '2024-11-12'})
      const client2 = getClient(instance, {apiVersion: '2023-08-01'})

      expect(client1).not.toBe(client2)
      expect(createClientSpy).toHaveBeenCalledTimes(2)
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
      expect(createClientSpy).toHaveBeenCalledWith(
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

  describe('source handling', () => {
    it('should create client when source is provided', () => {
      const client = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {projectId: 'source-project', dataset: 'source-dataset'},
      })

      expect(createClientSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          apiVersion: '2024-11-12',
          resource: {type: 'dataset', id: 'source-project.source-dataset'},
        }),
      )
      // Client should be projectless - no projectId/dataset in config
      expect(client.config()).not.toHaveProperty('projectId')
      expect(client.config()).not.toHaveProperty('dataset')
      expect(client.config()).toEqual(
        expect.objectContaining({
          resource: {type: 'dataset', id: 'source-project.source-dataset'},
        }),
      )
    })

    it('should create resource when source has array sourceId and be projectless', () => {
      const client = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {mediaLibraryId: 'media-lib-123'},
      })

      expect(createClientSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: {type: 'media-library', id: 'media-lib-123'},
          apiVersion: '2024-11-12',
        }),
      )
      // Client should be projectless - no projectId/dataset in config
      expect(client.config()).not.toHaveProperty('projectId')
      expect(client.config()).not.toHaveProperty('dataset')
      expect(client.config()).toEqual(
        expect.objectContaining({
          resource: {type: 'media-library', id: 'media-lib-123'},
        }),
      )
    })

    it('should create resource when canvas source is provided and be projectless', () => {
      const client = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {canvasId: 'canvas-123'},
      })

      expect(createClientSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: {type: 'canvas', id: 'canvas-123'},
          apiVersion: '2024-11-12',
        }),
      )
      // Client should be projectless - no projectId/dataset in config
      expect(client.config()).not.toHaveProperty('projectId')
      expect(client.config()).not.toHaveProperty('dataset')
      expect(client.config()).toEqual(
        expect.objectContaining({
          resource: {type: 'canvas', id: 'canvas-123'},
        }),
      )
    })

    it('should create projectless client when source is provided, ignoring instance config', () => {
      const client = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {projectId: 'source-project', dataset: 'source-dataset'},
      })

      // Client should be projectless - source takes precedence, instance config is ignored
      expect(client.config()).not.toHaveProperty('projectId')
      expect(client.config()).not.toHaveProperty('dataset')
      expect(client.config()).toEqual(
        expect.objectContaining({
          resource: {type: 'dataset', id: 'source-project.source-dataset'},
        }),
      )
    })

    it('should warn when both source and explicit projectId/dataset are provided', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const client = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {projectId: 'source-project', dataset: 'source-dataset'},
        projectId: 'explicit-project',
        dataset: 'explicit-dataset',
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        'Both source and explicit projectId/dataset are provided. The source will be used and projectId/dataset will be ignored.',
      )
      // Client should still be projectless despite explicit projectId/dataset
      expect(client.config()).not.toHaveProperty('projectId')
      expect(client.config()).not.toHaveProperty('dataset')
      consoleSpy.mockRestore()
    })

    it('should create different clients for different sources', () => {
      const client1 = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {projectId: 'source-project', dataset: 'source-dataset'},
      })
      const client2 = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {mediaLibraryId: 'media-lib-123'},
      })
      const client3 = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {canvasId: 'canvas-123'},
      })

      expect(client1).not.toBe(client2)
      expect(client2).not.toBe(client3)
      expect(client1).not.toBe(client3)
      expect(createClientSpy).toHaveBeenCalledTimes(3)
    })

    it('should reuse clients with identical source configurations', () => {
      const client1 = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {projectId: 'source-project', dataset: 'source-dataset'},
      })
      const client2 = getClient(instance, {
        apiVersion: '2024-11-12',
        source: {projectId: 'source-project', dataset: 'source-dataset'},
      })

      expect(client1).toBe(client2)
      expect(createClientSpy).toHaveBeenCalledTimes(1)
    })
  })
})
