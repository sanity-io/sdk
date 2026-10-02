import {createClient, type SanityClient} from '@sanity/client'
import {BehaviorSubject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientAuthState} from '../auth/authStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {getClient, getClientState} from './clientStore'

// Mock dependencies
vi.mock('@sanity/client')

vi.mock('../auth/authStore')

let instance: SanityInstance
let auth$: BehaviorSubject<Promise<{token: string} | undefined>>
beforeEach(() => {
  vi.resetAllMocks()

  auth$ = new BehaviorSubject(
    Promise.resolve<{token: string} | undefined>({token: 'initial-token'}),
  )
  vi.mocked(getClientAuthState).mockReturnValue({
    getCurrent: () => auth$.value,
    subscribe: vi.fn(),
    observable: auth$,
  })
  vi.mocked(createClient).mockImplementation(
    (clientConfig) => ({config: () => clientConfig}) as SanityClient,
  )
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
        projectId: 'test-project',
        dataset: 'test-dataset',
      }

      expect(vi.mocked(createClient)).toHaveBeenCalledWith({
        ...defaultConfiguration,
        apiVersion: '2024-11-12',
        auth: auth$,
      })
      expect(client.config()).toEqual({
        ...defaultConfiguration,
        apiVersion: '2024-11-12',
        auth: auth$,
      })
    })

    it('should pass staging apiHost when __SANITY_STAGING__ is true and no explicit apiHost', () => {
      vi.stubGlobal('__SANITY_STAGING__', true)

      getClient(instance, {apiVersion: '2024-11-12'})

      expect(vi.mocked(createClient)).toHaveBeenCalledWith(
        expect.objectContaining({
          apiHost: 'https://api.sanity.work',
        }),
      )

      vi.unstubAllGlobals()
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
      expect(vi.mocked(createClient)).toHaveBeenCalledTimes(1)
    })

    it('should create new clients when configuration changes', () => {
      const client1 = getClient(instance, {apiVersion: '2024-11-12'})
      const client2 = getClient(instance, {apiVersion: '2023-08-01'})

      expect(client1).not.toBe(client2)
      expect(vi.mocked(createClient)).toHaveBeenCalledTimes(2)
    })
  })

  describe('credentials', () => {
    it('keeps the same client when the credential changes', () => {
      const state = getClientState(instance, {apiVersion: '2024-11-12'})
      const nextSpy = vi.fn()
      const subscription = state.observable.subscribe(nextSpy)

      auth$.next(Promise.resolve({token: 'new-token'}))

      expect(nextSpy).toHaveBeenCalledTimes(1)
      expect(getClient(instance, {apiVersion: '2024-11-12'})).toBe(nextSpy.mock.calls[0][0])
      expect(vi.mocked(createClient)).toHaveBeenCalledTimes(1)
      subscription.unsubscribe()
    })

    it('gives every client the same credential stream', () => {
      getClient(instance, {apiVersion: '2024-11-12'})
      getClient(instance, {apiVersion: '2024-11-12', scope: 'global'})

      const [first, second] = vi.mocked(createClient).mock.calls
      expect(first[0].auth).toBe(auth$)
      expect(second[0].auth).toBe(auth$)
    })

    it('uses a caller-supplied token instead of the credential stream', () => {
      getClient(instance, {apiVersion: '2024-11-12', token: 'caller-token'})

      const [config] = vi.mocked(createClient).mock.calls[0]
      expect(config).toMatchObject({token: 'caller-token'})
      expect(config).not.toHaveProperty('auth')
    })
  })

  describe('resource handling', () => {
    it('should create resource when media library resource is provided and be projectless', () => {
      const client = getClient(instance, {
        apiVersion: '2024-11-12',
        resource: {mediaLibraryId: 'media-lib-123'},
      })

      expect(vi.mocked(createClient)).toHaveBeenCalledWith(
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

    it('should create resource when canvas resource is provided and be projectless', () => {
      const client = getClient(instance, {
        apiVersion: '2024-11-12',
        resource: {canvasId: 'canvas-123'},
      })

      expect(vi.mocked(createClient)).toHaveBeenCalledWith(
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

    it('should transform dataset resource to project-based config for now', () => {
      const client = getClient(instance, {
        apiVersion: '2024-11-12',
        resource: {projectId: 'source-project', dataset: 'source-dataset'},
      })

      expect(vi.mocked(createClient)).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'source-project',
          dataset: 'source-dataset',
        }),
      )
      expect(client.config()).toEqual(
        expect.objectContaining({
          projectId: 'source-project',
          dataset: 'source-dataset',
        }),
      )
    })

    it('should create different clients for different resources', () => {
      const client1 = getClient(instance, {
        apiVersion: '2024-11-12',
        resource: {projectId: 'source-project', dataset: 'source-dataset'},
      })
      const client2 = getClient(instance, {
        apiVersion: '2024-11-12',
        resource: {mediaLibraryId: 'media-lib-123'},
      })
      const client3 = getClient(instance, {
        apiVersion: '2024-11-12',
        resource: {canvasId: 'canvas-123'},
      })

      expect(client1).not.toBe(client2)
      expect(client2).not.toBe(client3)
      expect(client1).not.toBe(client3)
      expect(vi.mocked(createClient)).toHaveBeenCalledTimes(3)
    })

    it('should reuse clients with identical resource configurations', () => {
      const client1 = getClient(instance, {
        apiVersion: '2024-11-12',
        resource: {projectId: 'source-project', dataset: 'source-dataset'},
      })
      const client2 = getClient(instance, {
        apiVersion: '2024-11-12',
        resource: {projectId: 'source-project', dataset: 'source-dataset'},
      })

      expect(client1).toBe(client2)
      expect(vi.mocked(createClient)).toHaveBeenCalledTimes(1)
    })
  })
})
