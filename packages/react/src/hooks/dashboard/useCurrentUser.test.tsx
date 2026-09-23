import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost} from '@sanity/sdk/dashboard'
import {type CurrentUser} from '@sanity/types'
import {Suspense} from 'react'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, screen} from '../../../test/test-utils'
import {useCurrentUser} from './useCurrentUser'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

const user: CurrentUser = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: '',
  roles: [],
}

let host: MessageBusHost

describe('useCurrentUser', () => {
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
    function User() {
      const current = useCurrentUser()
      expectTypeOf(current).toEqualTypeOf<CurrentUser | null>()
      return <span>{current?.name ?? 'none'}</span>
    }
    render(
      <Suspense fallback="Loading">
        <User />
      </Suspense>,
    )

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      host.connections.subscribe((client) => client.emit('users.current', null))
    })
    expect(await screen.findByText('none')).toBeInTheDocument()

    act(() => host.connections.subscribe((client) => client.emit('users.current', user)))
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })
})
