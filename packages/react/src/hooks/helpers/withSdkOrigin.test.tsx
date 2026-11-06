import {createSanityInstance} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Component, type ReactNode, Suspense, use} from 'react'
import {ErrorBoundary, type FallbackProps} from 'react-error-boundary'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createCallbackHook} from './createCallbackHook'
import {createStateSourceHook} from './createStateSourceHook'
import {withSdkOrigin} from './withSdkOrigin'

const instance = createSanityInstance()
const context = vi.hoisted(() => ({missing: false}))
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: () => {
    if (context.missing) throw new Error('SanityInstance context not found')
    return instance
  },
}))

// The mark is a contract between SDK copies, so read it the way another copy would
const isMarked = (error: unknown) =>
  error instanceof Error && Object.hasOwn(error, Symbol.for('@sanity/sdk/errorOrigin'))

let caught: unknown[] = []
class AppBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  override state = {failed: false}
  static getDerivedStateFromError(error: unknown) {
    caught.push(error)
    return {failed: true}
  }
  override render() {
    return this.state.failed ? 'app caught' : this.props.children
  }
}

function RethrowingFallback({error}: FallbackProps): never {
  throw error
}

const useWorkingHook = createCallbackHook(() => 1)

describe('withSdkOrigin', () => {
  beforeEach(() => {
    caught = []
    context.missing = false
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('marks an error thrown by a factory hook and rethrows the same object', () => {
    const bug = new TypeError('sdk bug')
    const useBuggyHook = createStateSourceHook(() => {
      throw bug
    })
    function UsesBuggyHook() {
      useBuggyHook()
      return null
    }

    render(
      <AppBoundary>
        <ErrorBoundary FallbackComponent={RethrowingFallback}>
          <UsesBuggyHook />
        </ErrorBoundary>
      </AppBoundary>,
    )

    expect(screen.getByText('app caught')).toBeInTheDocument()
    expect(caught[0]).toBe(bug)
    expect(isMarked(bug)).toBe(true)
  })

  it('does not mark an error thrown by an app component that uses an SDK hook', () => {
    const appError = new Error('app bug')
    function App() {
      useWorkingHook()
      if (appError) throw appError
      return null
    }

    render(
      <AppBoundary>
        <App />
      </AppBoundary>,
    )

    expect(caught[0]).toBe(appError)
    expect(isMarked(appError)).toBe(false)
  })

  it('marks the error from a hook used outside a provider', () => {
    context.missing = true
    function App() {
      useWorkingHook()
      return null
    }

    render(
      <AppBoundary>
        <App />
      </AppBoundary>,
    )

    expect(isMarked(caught[0])).toBe(true)
  })

  it('passes a thrown Suspense promise through', async () => {
    let ready = false
    let resolve!: () => void
    const promise = new Promise<void>((r) => (resolve = r))
    const loaded = promise.then(() => {
      ready = true
    })
    const useSuspendingHook = createStateSourceHook({
      getState: () => ({
        subscribe: () => () => {},
        getCurrent: () => 'loaded',
        observable: undefined as never,
      }),
      shouldSuspend: () => !ready,
      suspender: () => loaded,
    })
    function UsesSuspendingHook() {
      return <>{useSuspendingHook()}</>
    }

    await act(async () => {
      render(
        <AppBoundary>
          <Suspense fallback="loading">
            <UsesSuspendingHook />
          </Suspense>
        </AppBoundary>,
      )
    })
    expect(screen.getByText('loading')).toBeInTheDocument()

    await act(async () => {
      resolve()
      await loaded
    })
    expect(await screen.findByText('loaded')).toBeInTheDocument()
    expect(caught).toEqual([])
  })

  it('works with use() and leaves the exception React throws to suspend unmarked', async () => {
    const thrown: unknown[] = []
    let resolve!: (value: string) => void
    const promise = new Promise<string>((r) => (resolve = r))
    const useUse = withSdkOrigin(() => {
      try {
        return use(promise)
      } catch (error) {
        thrown.push(error)
        throw error
      }
    })
    function UsesUse() {
      return <>{useUse()}</>
    }

    await act(async () => {
      render(
        <AppBoundary>
          <Suspense fallback="loading">
            <UsesUse />
          </Suspense>
        </AppBoundary>,
      )
    })
    expect(screen.getByText('loading')).toBeInTheDocument()

    await act(async () => {
      resolve('used')
      await promise
    })
    expect(await screen.findByText('used')).toBeInTheDocument()
    expect(caught).toEqual([])
    expect(thrown.length).toBeGreaterThan(0)
    expect(thrown.some(isMarked)).toBe(false)
  })

  it('does not mark the error React throws when an app calls an SDK hook conditionally', () => {
    const useStable = createStateSourceHook(() => ({
      subscribe: () => () => {},
      getCurrent: () => 1,
      observable: undefined as never,
    }))
    // The app under test breaks the rules of hooks on purpose. Calling the hook through a name
    // without the `use` prefix keeps the lint rules from rejecting this test file.
    const callSdkHookAgain = useStable
    function App({callTwice}: {callTwice: boolean}) {
      useStable()
      if (callTwice) callSdkHookAgain()
      return null
    }

    const {rerender} = render(
      <AppBoundary>
        <App callTwice={false} />
      </AppBoundary>,
    )
    rerender(
      <AppBoundary>
        <App callTwice />
      </AppBoundary>,
    )

    expect(String(caught[0])).toContain('Rendered more hooks')
    expect(caught.some(isMarked)).toBe(false)
  })
})
