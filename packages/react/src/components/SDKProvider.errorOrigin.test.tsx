import {createSanityInstance} from '@sanity/sdk'
import {reportError} from '@sanity/sdk/_internal'
import {render} from '@testing-library/react'
import {type ReactNode, useEffect} from 'react'
import {ErrorBoundary, type FallbackProps} from 'react-error-boundary'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../hooks/helpers/createStateSourceHook'
import {SDKProvider} from './SDKProvider'

// The reporter keeps an event only when the error, or an error in its cause chain, carries the
// SDK mark (or its stack names the SDK, which a bundled app's stack never does). These tests
// check which errors reaching the SDK boundary carry the mark. The reporter's tests in core
// cover what happens to marked and unmarked errors.
vi.mock('@sanity/sdk/_internal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  reportError: vi.fn(),
}))

const instance = createSanityInstance()
vi.mock('../hooks/context/useSanityInstance', () => ({useSanityInstance: () => instance}))
vi.mock('../context/ResourceProvider', () => ({
  ResourceProvider: ({children}: {children: ReactNode}) => children,
}))
vi.mock('./auth/AuthBoundary', () => ({
  AuthBoundary: ({children}: {children: ReactNode}) => children,
}))
vi.mock('../context/OrganizationResourcesProvider', () => ({
  OrganizationResourcesProvider: ({children}: {children: ReactNode}) => children,
}))

const MARK = Symbol.for('@sanity/sdk/errorOrigin')
function hasMarkInChain(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (Object.hasOwn(current, MARK)) return true
  }
  return false
}

const useBuggySdkHook = createStateSourceHook(() => {
  throw new TypeError('sdk internal bug')
})
const useWorkingSdkHook = createStateSourceHook(() => ({
  subscribe: () => () => {},
  getCurrent: () => 'ok',
  observable: undefined as never,
}))

/** Renders inside the SDK and returns every error the SDK boundary handed to the reporter. */
function reportedErrors(children: ReactNode): unknown[] {
  try {
    render(
      <SDKProvider config={{projectId: 'p', dataset: 'd'}} fallback={null}>
        {children}
      </SDKProvider>,
    )
  } catch {
    // SDKProvider rethrows errors it does not render; with no app boundary above, render throws
  }
  const errors = vi.mocked(reportError).mock.calls.map(([error]) => error)
  expect(errors.length).toBeGreaterThan(0)
  return errors
}

describe('SDKProvider error origin', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does not mark an error thrown by an app component', () => {
    function App(): ReactNode {
      throw new Error('app render bug')
    }
    expect(reportedErrors(<App />).some(hasMarkInChain)).toBe(false)
  })

  it('does not mark an app error thrown after an SDK hook returns', () => {
    function App() {
      if (useWorkingSdkHook() === 'ok') throw new Error('app bug after sdk hook')
      return null
    }
    expect(reportedErrors(<App />).some(hasMarkInChain)).toBe(false)
  })

  it("does not mark an error from an app's custom hook that wraps an SDK hook", () => {
    function useAppThing() {
      const value = useWorkingSdkHook()
      if (value === 'ok') throw new Error('app custom hook bug')
      return value
    }
    function App() {
      useAppThing()
      return null
    }
    expect(reportedErrors(<App />).some(hasMarkInChain)).toBe(false)
  })

  it('does not mark an error thrown by an app effect', () => {
    function App() {
      useWorkingSdkHook()
      useEffect(() => {
        throw new Error('app effect bug')
      }, [])
      return null
    }
    expect(reportedErrors(<App />).some(hasMarkInChain)).toBe(false)
  })

  it('marks an error thrown by an SDK hook', () => {
    function App() {
      useBuggySdkHook()
      return null
    }
    expect(reportedErrors(<App />).every(hasMarkInChain)).toBe(true)
  })

  it('keeps the mark when an app boundary wraps the SDK error in its own error', () => {
    function WrapAsAppError({error}: FallbackProps): never {
      throw new Error('app wrapper', {cause: error})
    }
    function App() {
      useBuggySdkHook()
      return null
    }
    const errors = reportedErrors(
      <ErrorBoundary FallbackComponent={WrapAsAppError}>
        <App />
      </ErrorBoundary>,
    )
    expect(errors.every((error) => error instanceof Error && error.message === 'app wrapper')).toBe(
      true,
    )
    expect(errors.every(hasMarkInChain)).toBe(true)
  })
})
