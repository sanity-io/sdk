import {getDashboardMessageBus, installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBus, MessageBusError, type ValueOf} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, fireEvent, render, renderHook, screen} from '../../../test/test-utils'
import {useSanityInstance} from '../context/useSanityInstance'
import {type TopicData, TopicError, useTopic} from './useTopic'

type Applications = Extract<NonNullable<ValueOf<'applications.list'>>, {ok: true}>['value']

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBus

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

  it('reads a seeded value and follows topic updates', () => {
    const {result} = renderHook(() => useTopic('applications.foreground'))

    expectTypeOf(result.current).toEqualTypeOf<string | null>()
    expect(result.current).toBeNull()

    act(() => host.emit('applications.foreground', 'application-2'))

    expect(result.current).toBe('application-2')
  })

  it('keeps one bus subscription across re-renders', () => {
    const {result, rerender} = renderHook(() => ({
      instance: useSanityInstance(),
      value: useTopic('applications.foreground'),
    }))
    const source = getDashboardMessageBus(result.current.instance)?.subscribe(
      'applications.foreground',
    )
    const subscribe = vi.spyOn(source as NonNullable<typeof source>, 'subscribe')

    rerender()
    rerender()

    expect(subscribe).not.toHaveBeenCalled()
  })

  it('suspends an unseeded topic until its first value', async () => {
    renderInBoundary(<Token />)

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      host.emit('auth.token', 'token')
    })

    expect(await screen.findByText('token')).toBeInTheDocument()
  })

  it('unwraps a successful topic result to its value', () => {
    const applications = [{id: 'application-1'}] as Applications
    host.emit('applications.list', {ok: true, value: applications})

    const {result} = renderHook(() => useTopic('applications.list'))

    expectTypeOf(result.current).toEqualTypeOf<TopicData<'applications.list'>>()
    expectTypeOf(result.current).toEqualTypeOf<Applications | null>()
    expect(result.current).toBe(applications)
  })

  it('throws a TopicError to the error boundary when a topic result fails', () => {
    host.emit('applications.list', {ok: false})

    const onError = renderInBoundary(<ApplicationCount />)

    expect(screen.getByText('Retry')).toBeInTheDocument()
    const error = onError.mock.calls[0][0] as TopicError
    expect(error).toBeInstanceOf(TopicError)
    expect(error.topic).toBe('applications.list')
  })

  it('throws a TopicError when a later result fails', () => {
    host.emit('applications.list', {ok: true, value: [] as Applications})
    const onError = renderInBoundary(<ApplicationCount />)
    expect(screen.getByText('0 applications')).toBeInTheDocument()

    act(() => host.emit('applications.list', {ok: false}))

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

  it('recovers from a failed read once the topic publishes', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})

    const onError = renderInBoundary(<Token />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(onError).toHaveBeenCalledTimes(1)

    // The failure is sticky until the topic publishes; resetting first fails again.
    fireEvent.click(screen.getByText('Retry'))
    expect(onError).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Retry')).toBeInTheDocument()

    act(() => host.emit('auth.token', 'token'))
    fireEvent.click(screen.getByText('Retry'))

    expect(screen.getByText('token')).toBeInTheDocument()
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('throws when used outside a dashboard application', () => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useTopic('applications.foreground'))).toThrow(
      'useTopic must be used inside a dashboard application',
    )
  })
})
