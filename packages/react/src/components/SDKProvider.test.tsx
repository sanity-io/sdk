import {createSanityInstance, type DocumentResource} from '@sanity/sdk'
import {render} from '@testing-library/react'
import React, {useContext, useEffect} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {OrgInferenceContext} from '../context/OrgInferenceContext'
import {ResourcesContext} from '../context/ResourcesContext'
import {resolveOrgResources} from '../utils/resolveOrgResources'
import {SDKProvider} from './SDKProvider'

const instance = createSanityInstance()

// Returns the same object on every call so the module-level WeakMap cache works across renders.
vi.mock('../hooks/context/useSanityInstance', () => {
  return {useSanityInstance: () => instance}
})

vi.mock('../utils/resolveOrgResources', () => ({
  resolveOrgResources: vi.fn(),
}))

vi.mock('../context/ResourceProvider', () => ({
  ResourceProvider: ({children, resource}: {children: React.ReactNode; resource?: unknown}) => (
    <div data-testid="resource-provider" data-resource={JSON.stringify(resource ?? null)}>
      {children}
    </div>
  ),
}))

vi.mock('./auth/AuthBoundary', () => ({
  AuthBoundary: ({children}: {children: React.ReactNode}) => (
    <div data-testid="auth-boundary">{children}</div>
  ),
}))

const mockResolveOrgResources = vi.mocked(resolveOrgResources)

function promiseWithResolvers<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

describe('SDKProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveOrgResources.mockResolvedValue({})
  })

  it('renders a single ResourceProvider with AuthBoundary', () => {
    const config = {}
    const resources = {
      default: {projectId: 'test-project', dataset: 'production'},
    }

    const {getByTestId} = render(
      <SDKProvider config={config} resources={resources} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const provider = getByTestId('resource-provider')
    expect(provider).toBeInTheDocument()
    expect(getByTestId('auth-boundary')).toBeInTheDocument()

    // resource prop should be the default resource
    expect(JSON.parse(provider.getAttribute('data-resource') || 'null')).toEqual({
      projectId: 'test-project',
      dataset: 'production',
    })
  })

  it('renders with multiple named resources', () => {
    const config = {}
    const resources = {
      default: {projectId: 'project-1', dataset: 'production'},
      secondary: {projectId: 'project-2', dataset: 'staging'},
    }

    const {getByTestId} = render(
      <SDKProvider config={config} resources={resources} fallback={<div>Loading...</div>}>
        <div>Child Content</div>
      </SDKProvider>,
    )

    const provider = getByTestId('resource-provider')
    expect(provider).toBeInTheDocument()

    expect(JSON.parse(provider.getAttribute('data-resource') || 'null')).toEqual({
      projectId: 'project-1',
      dataset: 'production',
    })
  })

  describe('OrgResourcesProvider', () => {
    // Captures OrgInferenceContext and ResourcesContext via useEffect (side-effect territory,
    // not render) to satisfy the react-compiler purity rule.
    //
    // OrgInferenceContext holds a Promise (or null).
    function makeCapture() {
      const inferenceDeferred = promiseWithResolvers<{
        value: Promise<Record<string, DocumentResource>> | null
      }>()
      const resourcesDeferred = promiseWithResolvers<Record<string, DocumentResource>>()

      const CaptureContexts = () => {
        const inferencePromise = useContext(OrgInferenceContext)
        const resources = useContext(ResourcesContext)
        useEffect(() => {
          inferenceDeferred.resolve({value: inferencePromise})
          resourcesDeferred.resolve(resources)
        }, [inferencePromise, resources])
        return null
      }

      return {
        CaptureContexts,
        // Resolves to {value: <OrgInferenceContext value>} — unwrap with .value.
        capturedInference: inferenceDeferred.promise,
        // Resolves to the ResourcesContext value.
        capturedResources: resourcesDeferred.promise,
      }
    }

    it('provides null inference promise when inferOrganizationResourcesFrom is not set', async () => {
      const {CaptureContexts, capturedInference} = makeCapture()
      render(
        <SDKProvider config={{}} resources={{}} fallback={null}>
          <CaptureContexts />
        </SDKProvider>,
      )
      expect((await capturedInference).value).toBeNull()
      expect(mockResolveOrgResources).not.toHaveBeenCalled()
    })

    it('calls resolveOrgResources with the sanity instance and organizationId', async () => {
      const {CaptureContexts, capturedInference} = makeCapture()
      render(
        <SDKProvider
          config={{}}
          inferOrganizationResourcesFrom="org-args-check"
          resources={{}}
          fallback={null}
        >
          <CaptureContexts />
        </SDKProvider>,
      )
      expect((await capturedInference).value).toBeInstanceOf(Promise)
      expect(mockResolveOrgResources).toHaveBeenCalledWith(instance, 'org-args-check')
    })

    it('inference promise resolves to a map of named resources', async () => {
      mockResolveOrgResources.mockResolvedValue({
        mediaLibrary: {mediaLibraryId: 'ml-id'},
        canvas: {canvasId: 'canvas-id'},
      })

      const {CaptureContexts, capturedInference} = makeCapture()
      render(
        <SDKProvider
          config={{}}
          inferOrganizationResourcesFrom="org-resolve-ok"
          resources={{}}
          fallback={null}
        >
          <CaptureContexts />
        </SDKProvider>,
      )

      const result = await (await capturedInference).value
      expect(result).toEqual({
        'media-library': {mediaLibraryId: 'ml-id'},
        'canvas': {canvasId: 'canvas-id'},
      })
    })

    it('inference promise resolves to {} and logs a warning when resolveOrgResources rejects', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockResolveOrgResources.mockRejectedValue(new Error('fetch failed'))

      const {CaptureContexts, capturedInference} = makeCapture()
      render(
        <SDKProvider
          config={{}}
          inferOrganizationResourcesFrom="org-reject"
          resources={{}}
          fallback={null}
        >
          <CaptureContexts />
        </SDKProvider>,
      )

      const result = await (await capturedInference).value
      expect(result).toEqual({})
      expect(consoleSpy).toHaveBeenCalledWith(
        '[sanity/sdk] Failed to infer org resources:',
        expect.any(Error),
      )
      consoleSpy.mockRestore()
    })

    it('caches the inference promise for the same organizationId', async () => {
      // Use a unique orgId so this test is not affected by the module-level cache
      // being populated by other tests.
      const orgId = 'org-cache-unique'
      const deferred1 = promiseWithResolvers<{
        value: Promise<Record<string, DocumentResource>> | null
      }>()
      const deferred2 = promiseWithResolvers<{
        value: Promise<Record<string, DocumentResource>> | null
      }>()

      const Capture1 = () => {
        const p = useContext(OrgInferenceContext)
        useEffect(() => deferred1.resolve({value: p}), [p])
        return null
      }
      const Capture2 = () => {
        const p = useContext(OrgInferenceContext)
        useEffect(() => deferred2.resolve({value: p}), [p])
        return null
      }

      render(
        <SDKProvider
          config={{}}
          inferOrganizationResourcesFrom={orgId}
          resources={{}}
          fallback={null}
        >
          <Capture1 />
        </SDKProvider>,
      )
      render(
        <SDKProvider
          config={{}}
          inferOrganizationResourcesFrom={orgId}
          resources={{}}
          fallback={null}
        >
          <Capture2 />
        </SDKProvider>,
      )

      const p1 = (await deferred1.promise).value
      const p2 = (await deferred2.promise).value
      expect(p1).toBeInstanceOf(Promise)
      expect(p1).toBe(p2)
      // resolveOrgResources should only have been called once across both renders.
      expect(mockResolveOrgResources).toHaveBeenCalledTimes(1)
    })

    it('provides explicit resources via ResourcesContext', async () => {
      const resources = {
        default: {projectId: 'p1', dataset: 'prod'},
        secondary: {projectId: 'p2', dataset: 'staging'},
      }

      const {CaptureContexts, capturedResources} = makeCapture()
      render(
        <SDKProvider config={{}} resources={resources} fallback={null}>
          <CaptureContexts />
        </SDKProvider>,
      )

      expect(await capturedResources).toEqual(resources)
    })
  })
})
