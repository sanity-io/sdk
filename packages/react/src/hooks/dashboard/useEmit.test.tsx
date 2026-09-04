import {act, fireEvent, render, renderHook, screen} from '@testing-library/react'
import {Suspense, use, useState, useTransition} from 'react'
import {beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {
  createIsolatedMessageBus,
  type MessageBus,
  type MessageBusEmitOptions,
  type MessageBusEmitResult,
} from '../../dashboard/messageBus/bus'
import {type PayloadOf, type ReplyOf} from '../../dashboard/messageBus/topics'
import {useEmit} from './useEmit'

const mocks = vi.hoisted(() => ({
  client: undefined as MessageBus | undefined,
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.client,
}))

describe('useEmit', () => {
  beforeEach(() => {
    mocks.client = createIsolatedMessageBus('dashboard')
  })

  it('returns a stable, typed emitter and resolves with the topic reply', async () => {
    mocks.client?.subscribe('auth.token.refresh', (message) => message.reply('token'))
    const {result, rerender} = renderHook(() => useEmit('auth.token.refresh'))
    const emit = result.current

    expectTypeOf(emit).toEqualTypeOf<
      (
        payload?: void,
        options?: MessageBusEmitOptions,
      ) => MessageBusEmitResult<ReplyOf<'auth.token.refresh'>>
    >()

    let token: string | undefined
    await act(async () => {
      token = await emit()
    })

    expect(token).toBe('token')
    rerender()
    expect(result.current).toBe(emit)
  })

  it('supports fire-and-forget delivery', () => {
    const payloads: PayloadOf<'panels.mode.set'>[] = []
    mocks.client?.subscribe('panels.mode.set').subscribe((payload) => payloads.push(payload))
    const {result} = renderHook(() => useEmit('panels.mode.set'))
    const payload = {name: 'comments', mode: 'aside'} as const

    act(() => {
      result.current(payload)
    })

    expect(payloads).toEqual([payload])
  })

  it('can be awaited inside a transition', async () => {
    let reply: (() => void) | undefined
    mocks.client?.subscribe('auth.token.refresh', (message) => {
      reply = () => message.reply('token')
    })

    function RefreshToken() {
      const emit = useEmit('auth.token.refresh')
      const [isPending, startTransition] = useTransition()
      return (
        <button
          onClick={() => {
            startTransition(async () => {
              await emit()
            })
          }}
        >
          {isPending ? 'Pending' : 'Refresh'}
        </button>
      )
    }

    render(<RefreshToken />)
    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('Pending')).toBeInTheDocument()

    await act(async () => reply?.())

    expect(await screen.findByText('Refresh')).toBeInTheDocument()
  })

  it('can suspend on an emitted reply', async () => {
    let reply: (() => void) | undefined
    mocks.client?.subscribe('auth.token.refresh', (message) => {
      reply = () => message.reply('token')
    })

    function Token({request}: {request: MessageBusEmitResult<string>}) {
      return use(request)
    }

    function RefreshToken() {
      const emit = useEmit('auth.token.refresh')
      const [request, setRequest] = useState<MessageBusEmitResult<string> | null>(null)
      return (
        <>
          <button onClick={() => setRequest(emit())}>Refresh</button>
          <Suspense fallback="Loading">{request && <Token request={request} />}</Suspense>
        </>
      )
    }

    render(<RefreshToken />)
    await act(async () => {
      screen.getByRole('button').click()
    })

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => reply?.())

    expect(await screen.findByText('token')).toBeInTheDocument()
  })

  it('throws outside a dashboard application', () => {
    mocks.client = undefined

    expect(() => renderHook(() => useEmit('auth.token.refresh'))).toThrow(
      'useEmit must be used inside a dashboard application',
    )
  })
})
