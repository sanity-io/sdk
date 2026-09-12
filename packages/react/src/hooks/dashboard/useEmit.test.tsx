import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {
  type MessageBus,
  type MessageBusEmitOptions,
  type MessageBusEmitResult,
  type PayloadOf,
  type ReplyOf,
} from '@sanity/sdk/dashboard'
import {Suspense, use, useState} from 'react'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, renderHook, screen} from '../../../test/test-utils'
import {useEmit} from './useEmit'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBus

describe('useEmit', () => {
  beforeEach(() => {
    // The SDK resolves its own app ID from the CLI-embedded global.
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns a stable, typed emitter and resolves with the topic reply', async () => {
    host.subscribe('auth.token.refresh', (message) => message.reply('token'))
    const {result, rerender} = renderHook(() => useEmit('auth.token.refresh'))
    const emit = result.current

    expectTypeOf(emit).toEqualTypeOf<
      (
        payload?: void,
        options?: MessageBusEmitOptions,
      ) => MessageBusEmitResult<ReplyOf<'auth.token.refresh'>>
    >()

    await expect(emit()).resolves.toBe('token')

    rerender()
    expect(result.current).toBe(emit)
  })

  it('delivers fire-and-forget payloads', () => {
    const payloads: PayloadOf<'panels.mode.set'>[] = []
    host.subscribe('panels.mode.set', (message) => payloads.push(message.payload))
    const {result} = renderHook(() => useEmit('panels.mode.set'))
    const payload = {name: 'comments', mode: 'aside'} as const

    result.current(payload)

    expect(payloads).toEqual([payload])
  })

  it('can suspend on an emitted reply', async () => {
    let reply: (() => void) | undefined
    host.subscribe('auth.token.refresh', (message) => {
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

  it('throws when used outside a dashboard application', () => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useEmit('auth.token.refresh'))).toThrow(
      'useEmit must be used inside a dashboard application',
    )
  })
})
