import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, screen} from '../../../test/test-utils'
import {useAuthToken} from './useAuthToken'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

describe('useAuthToken', () => {
  beforeEach(() => {
    // The SDK resolves its own app ID from the CLI-embedded global.
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('suspends until Dashboard publishes, then follows updates', async () => {
    function Token() {
      const token = useAuthToken()
      expectTypeOf(token).toEqualTypeOf<string | null>()
      return <span>{token ?? 'none'}</span>
    }
    render(
      <Suspense fallback="Loading">
        <Token />
      </Suspense>,
    )

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      host.connections.subscribe((client) => client.emit('auth.token', null))
    })
    expect(await screen.findByText('none')).toBeInTheDocument()

    act(() => host.connections.subscribe((client) => client.emit('auth.token', 'token-1')))
    expect(screen.getByText('token-1')).toBeInTheDocument()
  })
})
