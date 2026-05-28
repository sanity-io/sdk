import {createSanityInstance, type SanityInstance} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {use, useEffect} from 'react'
import {describe, expect, it, vi} from 'vitest'

import {SanityInstanceContext} from './SanityInstanceContext'
import {SanityInstanceProvider} from './SanityInstanceProvider'

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

describe('SanityInstanceProvider', () => {
  it('renders children', () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    render(
      <SanityInstanceProvider instance={instance} fallback={<div>Loading...</div>}>
        <div data-testid="test-child">Child Component</div>
      </SanityInstanceProvider>,
    )

    expect(screen.getByTestId('test-child')).toBeInTheDocument()
    instance.dispose()
  })

  it('provides the given instance via context', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const {promise, resolve} = promiseWithResolvers<SanityInstance | null>()

    const CaptureInstance = () => {
      const ctx = use(SanityInstanceContext)
      useEffect(() => resolve(ctx), [ctx])
      return null
    }

    render(
      <SanityInstanceProvider instance={instance} fallback={null}>
        <CaptureInstance />
      </SanityInstanceProvider>,
    )

    const provided = await promise
    expect(provided).toBe(instance)
    instance.dispose()
  })

  it('shows fallback during suspense', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const {promise, resolve} = promiseWithResolvers()

    function SuspendingChild(): React.ReactNode {
      throw promise
    }

    render(
      <SanityInstanceProvider
        instance={instance}
        fallback={<div data-testid="fallback">Loading...</div>}
      >
        <SuspendingChild />
      </SanityInstanceProvider>,
    )

    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    act(() => {
      resolve()
    })
    await new Promise((r) => setTimeout(r, 0))
    instance.dispose()
    consoleSpy.mockRestore()
  })

  it('does not dispose the instance on unmount', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    const {unmount} = render(
      <SanityInstanceProvider instance={instance} fallback={null}>
        <div />
      </SanityInstanceProvider>,
    )

    unmount()
    await new Promise((r) => setTimeout(r, 0))

    expect(instance.isDisposed()).toBe(false)
    instance.dispose()
  })
})
