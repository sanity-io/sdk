import {
  createSanityInstance,
  type DocumentResource,
  type SanityConfig,
  type SanityInstance,
} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Activity, StrictMode, use, useEffect} from 'react'
import {describe, expect, it, vi} from 'vitest'

import {ResourceContext} from './DefaultResourceContext'
import {ProjectContext} from './ProjectContext'
import {ResourceProvider} from './ResourceProvider'
import {SanityInstanceContext} from './SanityInstanceContext'
import {SanityInstanceProvider} from './SanityInstanceProvider'

const testConfig: SanityConfig = {
  projectId: 'test-project',
  dataset: 'test-dataset',
}

function promiseWithResolvers<T = void>(): {
  promise: Promise<T>
  resolve: (t: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (t: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {resolve, reject, promise}
}

describe('ResourceProvider', () => {
  it('renders children when loaded', () => {
    render(
      <ResourceProvider {...testConfig} fallback={<div>Loading...</div>}>
        <div data-testid="test-child">Child Component</div>
      </ResourceProvider>,
    )

    expect(screen.getByTestId('test-child')).toBeInTheDocument()
  })

  it('shows fallback during loading', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const {promise, resolve} = promiseWithResolvers()
    function SuspendingChild(): React.ReactNode {
      throw promise
    }

    render(
      <ResourceProvider {...testConfig} fallback={<div data-testid="fallback">Loading...</div>}>
        <SuspendingChild />
      </ResourceProvider>,
    )

    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    act(() => {
      resolve()
    })
    await new Promise((r) => setTimeout(r, 0))
    consoleSpy.mockRestore()
  })

  it('renders nothing during loading when fallback is null', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const {promise, resolve} = promiseWithResolvers()
    function SuspendingChild(): React.ReactNode {
      throw promise
    }

    const {container} = render(
      <ResourceProvider {...testConfig} fallback={null}>
        <SuspendingChild />
      </ResourceProvider>,
    )

    expect(container).toBeEmptyDOMElement()
    act(() => {
      resolve()
    })
    await new Promise((r) => setTimeout(r, 0))
    consoleSpy.mockRestore()
  })

  it('creates root instance when no parent context exists', async () => {
    const {promise, resolve} = promiseWithResolvers<SanityInstance | null>()

    const CaptureInstance = () => {
      const instance = use(SanityInstanceContext)
      useEffect(() => resolve(instance), [instance])
      return null
    }

    render(
      <ResourceProvider {...testConfig} fallback={null}>
        <CaptureInstance />
      </ResourceProvider>,
    )

    await expect(promise).resolves.toMatchObject({
      config: testConfig,
      isDisposed: expect.any(Function),
    })
  })

  it('reuses instance when parent context exists', async () => {
    const parentConfig: SanityConfig = {...testConfig, dataset: 'parent-dataset'}
    const child = promiseWithResolvers<SanityInstance | null>()

    const CaptureInstance = () => {
      const childInstance = use(SanityInstanceContext)
      useEffect(() => child.resolve(childInstance), [childInstance])
      return null
    }

    render(
      <ResourceProvider {...parentConfig} fallback={null}>
        <ResourceProvider {...testConfig} fallback={null}>
          <CaptureInstance />
        </ResourceProvider>
      </ResourceProvider>,
    )

    const childInstance = await child.promise
    expect(childInstance?.config).toEqual(parentConfig)
    expect(childInstance?.isDisposed()).toBe(false)
  })

  it('does not dispose the instance when unmounted', async () => {
    const {promise, resolve} = promiseWithResolvers<SanityInstance | null>()
    const CaptureInstance = () => {
      const instance = use(SanityInstanceContext)
      useEffect(() => resolve(instance), [instance])
      return null
    }

    const {unmount} = render(
      <ResourceProvider {...testConfig} fallback={null}>
        <CaptureInstance />
      </ResourceProvider>,
    )

    const instance = await promise
    unmount()
    await new Promise((r) => setTimeout(r, 0))

    expect(instance?.isDisposed()).toBe(false)
  })

  it('uses an instance its caller owns through SanityInstanceProvider', async () => {
    const owned = createSanityInstance(testConfig)
    const {promise, resolve} = promiseWithResolvers<SanityInstance | null>()
    const CaptureInstance = () => {
      const instance = use(SanityInstanceContext)
      useEffect(() => resolve(instance), [instance])
      return null
    }

    render(
      <SanityInstanceProvider instance={owned} fallback={null}>
        <ResourceProvider {...testConfig} fallback={null}>
          <CaptureInstance />
        </ResourceProvider>
      </SanityInstanceProvider>,
    )

    expect(await promise).toBe(owned)
  })

  it('keeps the same live instance when an <Activity> hides and shows it', async () => {
    const seen: (SanityInstance | null)[] = []
    const CaptureInstance = () => {
      const instance = use(SanityInstanceContext)
      useEffect(() => {
        seen.push(instance)
      }, [instance])
      return null
    }
    const tree = (
      <ResourceProvider {...testConfig} fallback={null}>
        <CaptureInstance />
      </ResourceProvider>
    )

    const {rerender} = render(<Activity mode="visible">{tree}</Activity>)
    rerender(<Activity mode="hidden">{tree}</Activity>)
    // Longer than a tick, so a deferred dispose from the hide would have run.
    await act(() => new Promise((r) => setTimeout(r, 10)))
    rerender(<Activity mode="visible">{tree}</Activity>)

    const [before] = seen
    const after = seen.at(-1)
    expect(seen.length).toBeGreaterThan(1)
    expect(after).toBe(before)
    expect(after?.isDisposed()).toBe(false)
  })

  it('keeps a nested provider on the live parent instance across an <Activity> hide', async () => {
    const seen: (SanityInstance | null)[] = []
    const CaptureInstance = () => {
      const instance = use(SanityInstanceContext)
      useEffect(() => {
        seen.push(instance)
      }, [instance])
      return null
    }
    const tree = (
      <ResourceProvider {...testConfig} fallback={null}>
        <ResourceProvider projectId="nested-project" dataset="nested-dataset" fallback={null}>
          <CaptureInstance />
        </ResourceProvider>
      </ResourceProvider>
    )

    const {rerender} = render(<Activity mode="visible">{tree}</Activity>)
    rerender(<Activity mode="hidden">{tree}</Activity>)
    await act(() => new Promise((r) => setTimeout(r, 10)))
    rerender(<Activity mode="visible">{tree}</Activity>)

    const [before] = seen
    const after = seen.at(-1)
    expect(seen.length).toBeGreaterThan(1)
    expect(after).toBe(before)
    expect(after?.config).toEqual(testConfig)
    expect(after?.isDisposed()).toBe(false)
  })

  it('does not dispose on quick remount (Strict Mode)', async () => {
    const {promise, resolve} = promiseWithResolvers<SanityInstance | null>()
    const CaptureInstance = () => {
      const instance = use(SanityInstanceContext)
      useEffect(() => resolve(instance), [instance])
      return null
    }

    render(
      <StrictMode>
        <ResourceProvider {...testConfig} fallback={null}>
          <CaptureInstance />
        </ResourceProvider>
      </StrictMode>,
    )

    const instance = await promise
    // Wait a tick so a deferred dispose from Strict Mode's simulated unmount would have run.
    await new Promise((r) => setTimeout(r, 0))

    expect(instance?.isDisposed()).toBe(false)
  })

  it('uses default fallback when none provided', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const {promise, resolve} = promiseWithResolvers()
    function SuspendingChild(): React.ReactNode {
      throw promise
    }

    render(
      // @ts-expect-error Testing fallback behavior
      <ResourceProvider {...testConfig}>
        <SuspendingChild />
      </ResourceProvider>,
    )

    expect(screen.getByText(/Warning: No fallback provided/)).toBeInTheDocument()
    act(() => {
      resolve()
    })
    await new Promise((r) => setTimeout(r, 0))
    consoleSpy.mockRestore()
  })

  it('inherits the missing half of a partial nested config from the parent resource', async () => {
    const {promise, resolve} = promiseWithResolvers<DocumentResource | undefined>()
    const CaptureResource = () => {
      const resource = use(ResourceContext)
      useEffect(() => resolve(resource), [resource])
      return null
    }

    render(
      <ResourceProvider projectId="parent-project" dataset="parent-dataset" fallback={null}>
        {/* Partial config: only `dataset`. It should inherit `projectId` from the
          parent resource and resolve to a complete DatasetResource rather than
          being dropped in favor of the parent's dataset. */}
        <ResourceProvider dataset="child-dataset" fallback={null}>
          <CaptureResource />
        </ResourceProvider>
      </ResourceProvider>,
    )

    await expect(promise).resolves.toEqual({
      projectId: 'parent-project',
      dataset: 'child-dataset',
    })
  })

  it('does not merge a nested bare projectId with the enveloping dataset', async () => {
    const captured = promiseWithResolvers<{
      resource: DocumentResource | undefined
      projectId: string | undefined
    }>()
    const Capture = () => {
      const resource = use(ResourceContext)
      const projectId = use(ProjectContext)
      useEffect(() => captured.resolve({resource, projectId}), [resource, projectId])
      return null
    }

    render(
      <ResourceProvider projectId="parent-project" dataset="parent-dataset" fallback={null}>
        {/* Bare `projectId`: switches project scope. It must surface as the
          project but must NOT adopt the parent's dataset — that dataset belongs
          to a different project. */}
        <ResourceProvider projectId="child-project" fallback={null}>
          <Capture />
        </ResourceProvider>
      </ResourceProvider>,
    )

    await expect(captured.promise).resolves.toEqual({
      resource: undefined,
      projectId: 'child-project',
    })
  })
})
