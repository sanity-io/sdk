import {createSanityInstance, type DocumentResource} from '@sanity/sdk'
import {act, render} from '@testing-library/react'
import {type ReactNode, Suspense, useContext, useEffect} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useDashboardOrganizationId} from '../hooks/auth/useDashboardOrganizationId'
import {resolveOrgResources} from '../utils/resolveOrgResources'
import {OrganizationResourcesProvider} from './OrganizationResourcesProvider'
import {ResourcesContext} from './ResourcesContext'

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

// Reset to a fresh instance per test so the module-level WeakMap cache (keyed by
// instance) starts empty. `useSanityInstance` returns the same object across
// renders within a test, which is what the cache relies on.
let instance = createSanityInstance()

vi.mock('../hooks/context/useSanityInstance', () => {
  return {useSanityInstance: () => instance}
})

vi.mock('../hooks/auth/useDashboardOrganizationId', () => ({
  useDashboardOrganizationId: vi.fn(),
}))

vi.mock('../utils/resolveOrgResources', () => ({
  resolveOrgResources: vi.fn(),
}))

const mockResolveOrgResources = vi.mocked(resolveOrgResources)
const mockUseDashboardOrganizationId = vi.mocked(useDashboardOrganizationId)

describe('OrganizationResourcesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance()
    mockResolveOrgResources.mockResolvedValue({})
    mockUseDashboardOrganizationId.mockReturnValue(undefined)
  })

  // Captures ResourcesContext via useEffect (side-effect territory, not render)
  // to satisfy the react-compiler purity rule.
  function makeCapture() {
    const deferred = promiseWithResolvers<Record<string, DocumentResource>>()

    const CaptureContexts = () => {
      const resources = useContext(ResourcesContext)
      useEffect(() => {
        deferred.resolve(resources)
      }, [resources])
      return null
    }

    return {CaptureContexts, capturedResources: deferred.promise}
  }

  function renderProvider(
    children: ReactNode,
    options?: {
      resources?: Record<string, DocumentResource>
      inferMediaLibraryAndCanvas?: boolean
    },
  ) {
    return render(
      <Suspense fallback={<div>loading</div>}>
        <OrganizationResourcesProvider
          resources={options?.resources}
          inferMediaLibraryAndCanvas={options?.inferMediaLibraryAndCanvas}
        >
          {children}
        </OrganizationResourcesProvider>
      </Suspense>,
    )
  }

  it('does not suspend when inferMediaLibraryAndCanvas is not set', async () => {
    const {CaptureContexts, capturedResources} = makeCapture()
    renderProvider(<CaptureContexts />)
    const resources = await capturedResources
    expect(Object.keys(resources)).toHaveLength(0)
    expect(mockResolveOrgResources).not.toHaveBeenCalled()
  })

  it('suspends children while org resources are being fetched, then renders with resolved resources', async () => {
    mockUseDashboardOrganizationId.mockReturnValue('org-suspend-test')
    const {promise, resolve} = promiseWithResolvers<void>()
    mockResolveOrgResources.mockReturnValue(
      promise.then(() => ({
        mediaLibrary: {mediaLibraryId: 'ml-id'},
        canvas: {canvasId: 'canvas-id'},
      })) as ReturnType<typeof mockResolveOrgResources>,
    )

    const {CaptureContexts, capturedResources} = makeCapture()
    await act(async () => {
      renderProvider(<CaptureContexts />, {inferMediaLibraryAndCanvas: true})
    })

    await act(async () => {
      resolve()
    })

    const resources = await capturedResources
    expect(resources['media-library']).toEqual({mediaLibraryId: 'ml-id'})
    expect(resources['canvas']).toEqual({canvasId: 'canvas-id'})
  })

  it('renders without inferred entries and logs a warning when resolveOrgResources rejects', async () => {
    mockUseDashboardOrganizationId.mockReturnValue('org-warn-test')
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockResolveOrgResources.mockRejectedValue(new Error('fetch failed'))

    const {CaptureContexts, capturedResources} = makeCapture()
    await act(async () => {
      renderProvider(<CaptureContexts />, {inferMediaLibraryAndCanvas: true})
    })

    const resources = await capturedResources
    expect(resources['media-library']).toBeUndefined()
    expect(resources['canvas']).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[sanity/sdk] Failed to infer org resources:',
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })

  it('caches Promise references across providers for the same instance', () => {
    mockUseDashboardOrganizationId.mockReturnValue('org-cache-test')
    render(
      <Suspense fallback={null}>
        <OrganizationResourcesProvider inferMediaLibraryAndCanvas>
          {null}
        </OrganizationResourcesProvider>
      </Suspense>,
    )
    render(
      <Suspense fallback={null}>
        <OrganizationResourcesProvider inferMediaLibraryAndCanvas>
          {null}
        </OrganizationResourcesProvider>
      </Suspense>,
    )

    // resolveOrgResources should only have been called once across both providers.
    expect(mockResolveOrgResources).toHaveBeenCalledTimes(1)
  })

  it('explicit resources are passed through to ResourcesContext', async () => {
    const explicitResources = {
      default: {projectId: 'p1', dataset: 'prod'},
      secondary: {projectId: 'p2', dataset: 'staging'},
    }

    const {CaptureContexts, capturedResources} = makeCapture()
    renderProvider(<CaptureContexts />, {resources: explicitResources})

    expect(await capturedResources).toEqual(explicitResources)
  })

  it('explicit resources take precedence over inferred ones', async () => {
    mockUseDashboardOrganizationId.mockReturnValue('org-override-test')
    mockResolveOrgResources.mockResolvedValue({
      mediaLibrary: {mediaLibraryId: 'inferred-ml'},
      canvas: {canvasId: 'inferred-canvas'},
    })

    const explicitResources = {'media-library': {mediaLibraryId: 'explicit-ml'}}
    const {CaptureContexts, capturedResources} = makeCapture()
    await act(async () => {
      renderProvider(<CaptureContexts />, {
        resources: explicitResources,
        inferMediaLibraryAndCanvas: true,
      })
    })

    const resources = await capturedResources
    expect(resources['media-library']).toEqual({mediaLibraryId: 'explicit-ml'})
  })
})
