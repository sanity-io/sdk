import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type CapabilityRecord, type MessageBusHost} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, renderHook, screen} from '../../../test/test-utils'
import {useCapabilities} from './useCapabilities'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

describe('useCapabilities', () => {
  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('suspends until the host publishes, then follows updates', async () => {
    function Capabilities() {
      const capabilities = useCapabilities()
      expectTypeOf(capabilities).toEqualTypeOf<CapabilityRecord>()
      return <span>{capabilities.favorites ? 'favorites' : 'no favorites'}</span>
    }

    render(
      <Suspense fallback="Loading">
        <Capabilities />
      </Suspense>,
    )

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      host.connections.subscribe((client) =>
        client.emit('applications.capabilities', {globalUserMenu: true, history: true}),
      )
    })
    expect(await screen.findByText('no favorites')).toBeInTheDocument()

    act(() =>
      host.connections.subscribe((client) =>
        client.emit('applications.capabilities', {favorites: true}),
      ),
    )
    expect(screen.getByText('favorites')).toBeInTheDocument()
  })

  it('treats an empty record as published, not unpublished', async () => {
    function Capabilities() {
      const {globalUserMenu} = useCapabilities()
      return <span>{globalUserMenu ? 'menu' : 'no capabilities'}</span>
    }

    render(
      <Suspense fallback="Loading">
        <Capabilities />
      </Suspense>,
    )

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      host.connections.subscribe((client) => client.emit('applications.capabilities', {}))
    })
    expect(await screen.findByText('no capabilities')).toBeInTheDocument()
  })

  it('throws when used outside a dashboard application', () => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useCapabilities())).toThrow(
      'Cannot read topic "applications.capabilities" without an installed dashboard message bus',
    )
  })
})
