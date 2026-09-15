import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type ApplicationConfig, type MessageBusHost} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, renderHook, screen} from '../../../test/test-utils'
import {useApplicationConfigs} from './useApplicationConfigs'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

// The host writes state to each connection, so publish by emitting to every connection's client.
const emitConfigs = (value: ApplicationConfig[] | null) =>
  host.connections.subscribe((client) => client.emit('applications.config', value))

const configs: ApplicationConfig[] = [
  {
    appType: 'media-library',
    entry: 'https://media-library-config.sanity.run',
    moduleId: 'configs/installation_config',
    version: '1',
  },
  {
    appId: 'application-1',
    appType: 'media-library',
    entry: 'https://application-config.sanity.run',
    moduleId: 'configs/installation_config',
    version: '2',
  },
]

describe('useApplicationConfigs', () => {
  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns every published application config', () => {
    emitConfigs(configs)

    const {result} = renderHook(() => useApplicationConfigs())

    expectTypeOf(result.current).toEqualTypeOf<readonly ApplicationConfig[]>()
    expect(result.current).toEqual(configs)
  })

  it('suspends until the dashboard publishes its configs', async () => {
    function Configs() {
      return <span>{useApplicationConfigs().length} configs</span>
    }
    render(
      <Suspense fallback="Loading">
        <Configs />
      </Suspense>,
    )

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      emitConfigs(configs)
    })
    expect(await screen.findByText('2 configs')).toBeInTheDocument()
  })

  it('returns an empty list when the dashboard clears its configs', () => {
    emitConfigs(null)

    const {result} = renderHook(() => useApplicationConfigs())

    expect(result.current).toEqual([])
  })

  it('follows topic updates', () => {
    emitConfigs(null)
    const {result} = renderHook(() => useApplicationConfigs())
    expect(result.current).toEqual([])

    act(() => emitConfigs(configs))
    expect(result.current).toEqual(configs)
  })
})
