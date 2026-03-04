import {type DocumentResource, type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {StrictMode, use, useContext, useEffect} from 'react'
import {describe, expect, it} from 'vitest'

import {ResourceContext} from './DefaultResourceContext'
import {PerspectiveContext} from './PerspectiveContext'
import {ResourceProvider} from './ResourceProvider'
import {SanityInstanceContext} from './SanityInstanceContext'

const testConfig = {
  resource: {projectId: 'test-project', dataset: 'test-dataset'} as DocumentResource,
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
      config: {} as SanityConfig,
      isDisposed: expect.any(Function),
    })
  })

  it('provides ResourceContext and PerspectiveContext at root', async () => {
    const captured = promiseWithResolvers<{
      resource: DocumentResource | undefined
      perspective: unknown
    }>()

    const CaptureContexts = () => {
      const resource = useContext(ResourceContext)
      const perspective = useContext(PerspectiveContext)
      useEffect(() => captured.resolve({resource, perspective}), [resource, perspective])
      return null
    }

    render(
      <ResourceProvider
        resource={{projectId: 'abc', dataset: 'prod'}}
        perspective="drafts"
        fallback={null}
      >
        <CaptureContexts />
      </ResourceProvider>,
    )

    const result = await captured.promise
    expect(result.resource).toEqual({projectId: 'abc', dataset: 'prod'})
    expect(result.perspective).toBe('drafts')
  })

  it('nested provider overrides resource and perspective via context', async () => {
    const captured = promiseWithResolvers<{
      instance: SanityInstance | null
      resource: DocumentResource | undefined
      perspective: unknown
    }>()

    const CaptureAll = () => {
      const instance = use(SanityInstanceContext)
      const resource = useContext(ResourceContext)
      const perspective = useContext(PerspectiveContext)
      useEffect(
        () => captured.resolve({instance, resource, perspective}),
        [instance, resource, perspective],
      )
      return null
    }

    render(
      <ResourceProvider resource={{projectId: 'parent-proj', dataset: 'parent-ds'}} fallback={null}>
        <ResourceProvider
          resource={{projectId: 'child-proj', dataset: 'child-ds'}}
          perspective="drafts"
          fallback={null}
        >
          <CaptureAll />
        </ResourceProvider>
      </ResourceProvider>,
    )

    const result = await captured.promise
    // Instance is the parent's (nested provider does not create a new one)
    expect(result.instance?.instanceId).toBeDefined()
    // Resource and perspective come from the nested provider's context
    expect(result.resource).toEqual({projectId: 'child-proj', dataset: 'child-ds'})
    expect(result.perspective).toBe('drafts')
  })

  it('nested provider inherits parent context when not overridden', async () => {
    const captured = promiseWithResolvers<{
      resource: DocumentResource | undefined
      perspective: unknown
    }>()

    const CaptureContexts = () => {
      const resource = useContext(ResourceContext)
      const perspective = useContext(PerspectiveContext)
      useEffect(() => captured.resolve({resource, perspective}), [resource, perspective])
      return null
    }

    render(
      <ResourceProvider
        resource={{projectId: 'parent-proj', dataset: 'parent-ds'}}
        perspective="drafts"
        fallback={null}
      >
        <ResourceProvider fallback={null}>
          <CaptureContexts />
        </ResourceProvider>
      </ResourceProvider>,
    )

    const result = await captured.promise
    expect(result.resource).toEqual({projectId: 'parent-proj', dataset: 'parent-ds'})
    expect(result.perspective).toBe('drafts')
  })

  it('disposes instance when unmounted', async () => {
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

    unmount()
    await new Promise((r) => setTimeout(r, 0))
    const instance = await promise

    expect(instance?.isDisposed()).toBe(true)
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

    expect(instance?.isDisposed()).toBe(false)
  })

  it('uses default fallback when none provided', async () => {
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
  })
})
