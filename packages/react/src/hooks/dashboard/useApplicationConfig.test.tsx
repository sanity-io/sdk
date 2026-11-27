import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type ApplicationConfig, type MessageBusHost} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, renderHook, screen} from '../../../test/test-utils'
import {type ApplicationConfigSelector, useApplicationConfig} from './useApplicationConfig'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

// The host writes state to each connection, so publish by emitting to every connection's client.
const emitConfigs = (value: ApplicationConfig[] | null) =>
  host.connections.subscribe((client) => client.emit('applications.config', value))

const typeConfig: ApplicationConfig = {
  appType: 'media-library',
  entry: 'https://media-library-config.sanity.run',
  moduleId: 'configs/installation_config',
  version: '1',
}

const appConfig: ApplicationConfig = {
  appId: 'application-1',
  appType: 'media-library',
  entry: 'https://application-config.sanity.run',
  moduleId: 'configs/installation_config',
  version: '2',
}

describe('useApplicationConfig', () => {
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

  it('selects a config by application type or application id', () => {
    emitConfigs([typeConfig, appConfig])

    const {result, rerender} = renderHook<
      {selector: ApplicationConfigSelector},
      ApplicationConfig | null
    >(({selector}) => useApplicationConfig(selector), {
      initialProps: {selector: {appType: 'media-library'}},
    })

    expectTypeOf(result.current).toEqualTypeOf<ApplicationConfig | null>()
    expect(result.current).toBe(typeConfig)

    rerender({selector: {appId: 'application-1'}})
    expect(result.current).toBe(appConfig)
  })

  it('selects the type-level config for an appType query regardless of emit order', () => {
    // App-scoped config first: a naive find() would return it for a type query.
    emitConfigs([appConfig, typeConfig])

    const {result} = renderHook(() => useApplicationConfig({appType: 'media-library'}))

    expect(result.current).toBe(typeConfig)
  })

  it('returns null when no config matches the selector', () => {
    emitConfigs([typeConfig, appConfig])

    const {result} = renderHook(() => useApplicationConfig({appId: 'missing'}))

    expect(result.current).toBeNull()
  })

  it('suspends until the dashboard publishes its configs', async () => {
    function MediaLibrary() {
      const config = useApplicationConfig({appType: 'media-library'})
      return <span>{config?.moduleId ?? 'none'}</span>
    }
    render(
      <Suspense fallback="Loading">
        <MediaLibrary />
      </Suspense>,
    )

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      emitConfigs([typeConfig])
    })
    expect(await screen.findByText('configs/installation_config')).toBeInTheDocument()
  })

  it('follows topic updates', () => {
    emitConfigs([typeConfig])
    const {result} = renderHook(() => useApplicationConfig({appId: 'application-1'}))
    expect(result.current).toBeNull()

    act(() => emitConfigs([typeConfig, appConfig]))
    expect(result.current).toBe(appConfig)
  })
})
