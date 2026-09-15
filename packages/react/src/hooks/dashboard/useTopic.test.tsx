import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {
  MessageBusError,
  type MessageBusHost,
  type TopicData,
  TopicError,
  type ValueOf,
} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, fireEvent, render, renderHook, screen} from '../../../test/test-utils'
import {useTopic} from './useTopic'

type Applications = Extract<NonNullable<ValueOf<'applications.list'>>, {ok: true}>['value']

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

function Token() {
  return <span>{useTopic('auth.token')}</span>
}

function ApplicationCount() {
  const applications = useTopic('applications.list')
  return <span>{applications?.length ?? 0} applications</span>
}

function renderInBoundary(ui: React.ReactNode, onError = vi.fn()) {
  render(
    <ErrorBoundary
      fallbackRender={({resetErrorBoundary}) => <button onClick={resetErrorBoundary}>Retry</button>}
      onError={onError}
    >
      <Suspense fallback="Loading">{ui}</Suspense>
    </ErrorBoundary>,
  )
  return onError
}

describe('useTopic', () => {
  beforeEach(() => {
    // The SDK resolves its own app ID from the CLI-embedded global.
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('reads a published value and follows topic updates', () => {
    host.connections.subscribe((client) => client.emit('applications.foreground', null))
    const {result} = renderHook(() => useTopic('applications.foreground'))

    expectTypeOf(result.current).toEqualTypeOf<string | null>()
    expect(result.current).toBeNull()

    act(() =>
      host.connections.subscribe((client) =>
        client.emit('applications.foreground', 'application-2'),
      ),
    )

    expect(result.current).toBe('application-2')
  })

  it('suspends an unseeded topic until its first value', async () => {
    renderInBoundary(<Token />)

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      host.connections.subscribe((client) => client.emit('auth.token', 'token'))
    })

    expect(await screen.findByText('token')).toBeInTheDocument()
  })

  it('unwraps a successful topic result to its value', () => {
    const applications = [{id: 'application-1'}] as Applications
    host.connections.subscribe((client) =>
      client.emit('applications.list', {ok: true, value: applications}),
    )

    const {result} = renderHook(() => useTopic('applications.list'))

    expectTypeOf(result.current).toEqualTypeOf<TopicData<'applications.list'>>()
    expectTypeOf(result.current).toEqualTypeOf<Applications | null>()
    expect(result.current).toBe(applications)
  })

  it('throws a TopicError to the error boundary when a topic result fails', () => {
    host.connections.subscribe((client) => client.emit('applications.list', {ok: false}))

    const onError = renderInBoundary(<ApplicationCount />)

    expect(screen.getByText('Retry')).toBeInTheDocument()
    const error = onError.mock.calls[0][0] as TopicError
    expect(error).toBeInstanceOf(TopicError)
    expect(error.topic).toBe('applications.list')
  })

  it('throws a TopicError when the first published result fails', async () => {
    const onError = renderInBoundary(<ApplicationCount />)
    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      host.connections.subscribe((client) => client.emit('applications.list', {ok: false}))
    })

    expect(await screen.findByText('Retry')).toBeInTheDocument()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(TopicError)
  })

  it('throws a TopicError when a later result fails', () => {
    host.connections.subscribe((client) =>
      client.emit('applications.list', {ok: true, value: [] as Applications}),
    )
    const onError = renderInBoundary(<ApplicationCount />)
    expect(screen.getByText('0 applications')).toBeInTheDocument()

    act(() => host.connections.subscribe((client) => client.emit('applications.list', {ok: false})))

    expect(screen.getByText('Retry')).toBeInTheDocument()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(TopicError)
  })

  it('throws to the error boundary when the query deadline passes', async () => {
    // Only the query deadline is faked; React's scheduler keeps real timers so the retry renders.
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})

    const onError = renderInBoundary(<Token />)
    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(screen.getByText('Retry')).toBeInTheDocument()
    const error = onError.mock.calls[0][0] as MessageBusError
    expect(error).toBeInstanceOf(MessageBusError)
    expect(error.code).toBe('TIMEOUT')
  })

  it('retries with a fresh deadline when the boundary resets after the failure is released', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})

    const onError = renderInBoundary(<Token />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(onError).toHaveBeenCalledTimes(1)

    // The failure is held for a short grace period, then dropped with its last reader.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    fireEvent.click(screen.getByText('Retry'))
    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      host.connections.subscribe((client) => client.emit('auth.token', 'token'))
    })

    expect(screen.getByText('token')).toBeInTheDocument()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('does not throw a failure recorded after the reader unmounted at the next mount', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})

    const {unmount} = render(<Suspense fallback="Loading">{<Token />}</Suspense>)
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })

    const onError = renderInBoundary(<Token />)

    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(onError).not.toHaveBeenCalled()
  })

  it('throws when used outside a dashboard application', () => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useTopic('applications.foreground'))).toThrow(
      'Cannot read topic "applications.foreground" without an installed dashboard message bus',
    )
  })
})
