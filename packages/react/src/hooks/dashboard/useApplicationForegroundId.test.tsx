import {type Application} from '@sanity/sdk'
import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, screen} from '../../../test/test-utils'
import {useApplicationForegroundId} from './useApplicationForegroundId'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

describe('useApplicationForegroundId', () => {
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
    function Foreground() {
      const id = useApplicationForegroundId()
      expectTypeOf(id).toEqualTypeOf<Application['id'] | null>()
      return <span>{id ?? 'none'}</span>
    }
    render(
      <Suspense fallback="Loading">
        <Foreground />
      </Suspense>,
    )

    expect(screen.getByText('Loading')).toBeInTheDocument()

    // Dashboard publishes `null` on boot when no application is in the foreground.
    await act(async () => {
      host.connections.subscribe((client) => client.emit('applications.foreground', null))
    })
    expect(await screen.findByText('none')).toBeInTheDocument()

    act(() =>
      host.connections.subscribe((client) =>
        client.emit('applications.foreground', 'application-1'),
      ),
    )
    expect(screen.getByText('application-1')).toBeInTheDocument()
  })
})
