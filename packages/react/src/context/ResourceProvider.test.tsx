import {type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {render, screen} from '@testing-library/react'
import {StrictMode, use, useEffect} from 'react'
import {describe, expect, it} from 'vitest'

import {ResourceProvider} from './ResourceProvider'
import {SanityInstanceContext} from './SanityInstanceContext'

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

  it('shows fallback during loading', () => {
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
    resolve()
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

  it('creates child instance when parent context exists', async () => {
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
    expect(childInstance?.config).toEqual(testConfig)
    expect(childInstance?.isDisposed()).toBe(false)
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

  it('uses default fallback when none provided', () => {
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
    resolve()
  })
})
