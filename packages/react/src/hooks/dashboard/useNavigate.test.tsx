import {type PathChangeMessage} from '@sanity/message-protocol'
import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost, type NavigationLocation, type ValueOf} from '@sanity/sdk/dashboard'
import {renderHook} from '@testing-library/react'
import {Activity, type ReactNode, useEffect, useState} from 'react'
import {config as rxjsConfig} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest'

import {act, AppProviders, renderHook as renderHookWithInstance} from '../../../test/test-utils'
import {useNavigate} from './useNavigate'

const mockSendMessage = vi.fn()
let mockMessageHandler: ((data: PathChangeMessage['data']) => void) | undefined

vi.mock('../comlink/useWindowConnection', () => {
  return {
    useWindowConnection: ({
      onMessage,
    }: {
      onMessage?: Record<string, (data: PathChangeMessage['data']) => void>
    }) => {
      mockMessageHandler = onMessage?.['dashboard/v1/history/change-path']
      return {
        sendMessage: mockSendMessage,
      }
    },
  }
})

describe('useNavigate', () => {
  const mockNavigateFn = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    mockMessageHandler = undefined
  })

  it('calls navigate function with correct data when message is received', () => {
    renderHook(() => useNavigate(mockNavigateFn))

    const mockNavigationData = {
      path: '/test-path',
      type: 'push' as const,
    }
    mockMessageHandler?.(mockNavigationData)

    expect(mockNavigateFn).toHaveBeenCalledWith(mockNavigationData)
  })

  it('reports an in-app navigation over the Comlink update-url message', () => {
    const {result} = renderHook(() => useNavigate(mockNavigateFn))

    result.current({path: 'documents/abc'})

    // jsdom's origin is fixed at http://localhost:3000 in this test env.
    expect(mockSendMessage).toHaveBeenCalledWith(
      'dashboard/v1/bridge/listeners/history/update-url',
      {url: 'http://localhost:3000/documents/abc'},
    )
  })

  it('drops a dashboard-scoped navigation with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => warn.mockRestore())
    const {result} = renderHook(() => useNavigate(mockNavigateFn))

    result.current({path: '/studios/abc', scope: 'dashboard'})

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('reports navigations and ignores inbound ones when no navigate function is passed', () => {
    const {result} = renderHook(() => useNavigate())

    expect(() => mockMessageHandler?.({path: '/test-path', type: 'push'})).not.toThrow()

    result.current({path: 'documents/abc'})

    expect(mockSendMessage).toHaveBeenCalledWith(
      'dashboard/v1/bridge/listeners/history/update-url',
      {url: 'http://localhost:3000/documents/abc'},
    )
  })
})

describe('useNavigate (message bus)', () => {
  const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
  let host: MessageBusHost
  // Every navigation.location.update the app sends to the host.
  let updates: {url: string; history?: string}[]

  const emitLocation = (value: NavigationLocation | null) =>
    host.connections.subscribe((client) =>
      client.emit('navigation.location', value as ValueOf<'navigation.location'>),
    )

  const publishBasePath = () =>
    host.connections.subscribe((client) =>
      client.emit('applications.base-path', {ok: true, value: '/applications/app'}),
    )

  // The `useNavigate` example: a router that reports every location.
  function useRoutedApp(initialPath: string) {
    const [path, setPath] = useState(initialPath)
    const report = useNavigate((navigation) => setPath(navigation.path))
    useEffect(() => report({path}), [path, report])
    return path
  }

  beforeEach(() => {
    updates = []
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
    host.subscribe('navigation.location.update', (message) => {
      updates.push(message.payload)
      message.reply({ok: true})
    })
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('does not fire on the initial replayed location', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    renderHookWithInstance(() => useNavigate(navigateFn))

    expect(navigateFn).not.toHaveBeenCalled()
  })

  it.each([['push'], ['replace']] as const)(
    'fires once for a host-mediated %s request to this app',
    (navigationType) => {
      publishBasePath()
      emitLocation({appId: 'dashboard', path: 'dashboard', transition: null})

      const navigateFn = vi.fn()
      renderHookWithInstance(() => useNavigate(navigateFn))

      const to = {appId: 'app', path: 'documents/abc'}
      act(() => {
        emitLocation({appId: 'dashboard', path: 'dashboard', transition: {navigationType, to}})
        emitLocation({appId: 'app', path: 'documents/abc', transition: {navigationType, to}})
        emitLocation({appId: 'app', path: 'documents/abc', transition: null})
      })

      expect(navigateFn).toHaveBeenCalledTimes(1)
      expect(navigateFn).toHaveBeenCalledWith({path: 'documents/abc', type: navigationType})
    },
  )

  it('ignores a transition targeting another app', () => {
    publishBasePath()
    emitLocation({appId: 'dashboard', path: 'dashboard', transition: null})

    const navigateFn = vi.fn()
    renderHookWithInstance(() => useNavigate(navigateFn))

    const to = {appId: 'other', path: 'other/route'}
    act(() => {
      emitLocation({
        appId: 'dashboard',
        path: 'dashboard',
        transition: {navigationType: 'push', to},
      })
      emitLocation({appId: 'other', path: 'other/route', transition: {navigationType: 'push', to}})
      emitLocation({appId: 'other', path: 'other/route', transition: null})
    })

    expect(navigateFn).not.toHaveBeenCalled()
  })

  it('follows a back or forward navigation in the host', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    renderHookWithInstance(() => useNavigate(navigateFn))

    act(() => {
      emitLocation({appId: 'app', path: 'documents/def', transition: null})
    })

    expect(navigateFn).toHaveBeenCalledTimes(1)
    expect(navigateFn).toHaveBeenCalledWith({path: 'documents/def', type: 'replace'})
  })

  it('emits navigation.location.update with the joined path and history for an outbound report', async () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    const {result} = renderHookWithInstance(() => useNavigate(navigateFn))

    await act(async () => {
      result.current({path: 'documents/def', type: 'replace'})
    })

    expect(updates).toEqual([{url: '/applications/app/documents/def', history: 'replace'}])
  })

  it('defaults the outbound history to push when no type is given', async () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const {result} = renderHookWithInstance(() => useNavigate(vi.fn()))

    await act(async () => {
      result.current({path: 'documents/def'})
    })

    expect(updates).toEqual([{url: '/applications/app/documents/def', history: 'push'}])
  })

  it('joins a trailing-slash base and a leading-slash path into a single separator', async () => {
    host.connections.subscribe((client) =>
      client.emit('applications.base-path', {ok: true, value: '/applications/app/'}),
    )
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const {result} = renderHookWithInstance(() => useNavigate(vi.fn()))

    await act(async () => {
      result.current({path: '/documents/def'})
    })

    expect(updates).toEqual([{url: '/applications/app/documents/def', history: 'push'}])
  })

  it('does not navigate the app to a location it reported itself, but follows the host after', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    const {result} = renderHookWithInstance(() => useNavigate(navigateFn))

    const own = {appId: 'app', path: 'documents/def'}
    act(() => {
      result.current({path: 'documents/def'})
      emitLocation({
        appId: 'app',
        path: 'documents/abc',
        transition: {navigationType: 'push', to: own},
      })
      emitLocation({
        appId: 'app',
        path: 'documents/def',
        transition: {navigationType: 'push', to: own},
      })
      emitLocation({appId: 'app', path: 'documents/def', transition: null})
    })

    expect(navigateFn).not.toHaveBeenCalled()

    const hostTo = {appId: 'app', path: 'documents/ghi'}
    act(() => {
      emitLocation({
        appId: 'app',
        path: 'documents/def',
        transition: {navigationType: 'push', to: hostTo},
      })
      emitLocation({
        appId: 'app',
        path: 'documents/ghi',
        transition: {navigationType: 'push', to: hostTo},
      })
      emitLocation({appId: 'app', path: 'documents/ghi', transition: null})
    })

    expect(navigateFn).toHaveBeenCalledTimes(1)
    expect(navigateFn).toHaveBeenCalledWith({path: 'documents/ghi', type: 'push'})
  })

  it('does not navigate the app when the host commits the path it is already at', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    renderHookWithInstance(() => useNavigate(navigateFn))

    const to = {appId: 'app', path: 'documents/abc'}
    act(() => {
      emitLocation({appId: 'app', path: 'documents/abc', transition: {navigationType: 'push', to}})
      emitLocation({appId: 'app', path: 'documents/abc', transition: null})
    })

    expect(navigateFn).not.toHaveBeenCalled()
  })

  it('does not report a back or forward navigation back to the host', async () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})
    const {result} = renderHookWithInstance(() => useRoutedApp('documents/abc'))

    act(() => emitLocation({appId: 'app', path: 'documents/def', transition: null}))
    await act(async () => {})

    expect(result.current).toBe('documents/def')
    expect(updates).toEqual([])
  })

  it('follows the path the host commits when it differs from the requested one', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    renderHookWithInstance(() => useNavigate(navigateFn))

    const to = {appId: 'app', path: 'a'}
    act(() => {
      emitLocation({appId: 'app', path: 'documents/abc', transition: {navigationType: 'push', to}})
      emitLocation({appId: 'app', path: 'b', transition: null})
    })

    expect(navigateFn).toHaveBeenCalledTimes(1)
    expect(navigateFn).toHaveBeenCalledWith({path: 'b', type: 'push'})
  })

  it('does not navigate the app to a location it reported with a leading slash', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    const {result} = renderHookWithInstance(() => useNavigate(navigateFn))

    const own = {appId: 'app', path: 'documents/def'}
    act(() => {
      result.current({path: '/documents/def'})
      emitLocation({
        appId: 'app',
        path: 'documents/abc',
        transition: {navigationType: 'push', to: own},
      })
      emitLocation({
        appId: 'app',
        path: 'documents/def',
        transition: {navigationType: 'push', to: own},
      })
      emitLocation({appId: 'app', path: 'documents/def', transition: null})
    })

    expect(navigateFn).not.toHaveBeenCalled()
  })

  it('fires host-mediated commits while the base path is unpublished', () => {
    emitLocation({appId: 'dashboard', path: 'dashboard', transition: null})

    const navigateFn = vi.fn()
    renderHookWithInstance(() => useNavigate(navigateFn))

    const to = {appId: 'app', path: 'documents/abc'}
    act(() => {
      emitLocation({
        appId: 'dashboard',
        path: 'dashboard',
        transition: {navigationType: 'push', to},
      })
      emitLocation({appId: 'app', path: 'documents/abc', transition: {navigationType: 'push', to}})
      emitLocation({appId: 'app', path: 'documents/abc', transition: null})
    })

    expect(navigateFn).toHaveBeenCalledTimes(1)
    expect(navigateFn).toHaveBeenCalledWith({path: 'documents/abc', type: 'push'})
  })

  it('drops an outbound report when the base path is not ok', async () => {
    host.connections.subscribe((client) => client.emit('applications.base-path', {ok: false}))
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const {result} = renderHookWithInstance(() => useNavigate(vi.fn()))

    await act(async () => {
      result.current({path: 'documents/def'})
    })

    expect(updates).toEqual([])
  })

  it('emits a dashboard-scoped URL as-is while the base path is unpublished and fires navigateFn when it lands in this app', async () => {
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    const {result} = renderHookWithInstance(() => useNavigate(navigateFn))

    await act(async () => {
      result.current({path: '/applications/app/documents/def', scope: 'dashboard'})
    })

    expect(updates).toEqual([{url: '/applications/app/documents/def', history: 'push'}])

    const to = {appId: 'app', path: 'documents/def'}
    act(() => {
      emitLocation({appId: 'app', path: 'documents/abc', transition: {navigationType: 'push', to}})
      emitLocation({appId: 'app', path: 'documents/def', transition: null})
    })

    expect(navigateFn).toHaveBeenCalledTimes(1)
    expect(navigateFn).toHaveBeenCalledWith({path: 'documents/def', type: 'push'})
  })

  it('does not navigate the app to its reported location after a dashboard-scoped report', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    const {result} = renderHookWithInstance(() => useNavigate(navigateFn))

    const own = {appId: 'app', path: 'documents/def'}
    act(() => {
      result.current({path: 'documents/def'})
      result.current({path: '/studios/xyz', scope: 'dashboard'})
      emitLocation({
        appId: 'app',
        path: 'documents/abc',
        transition: {navigationType: 'push', to: own},
      })
      emitLocation({appId: 'app', path: 'documents/def', transition: null})
    })

    expect(navigateFn).not.toHaveBeenCalled()
  })

  it('navigates and ignores inbound navigations when no navigate function is passed', async () => {
    const onUnhandledError = vi.fn()
    rxjsConfig.onUnhandledError = onUnhandledError
    onTestFinished(() => {
      rxjsConfig.onUnhandledError = null
    })
    publishBasePath()
    emitLocation({appId: 'dashboard', path: 'dashboard', transition: null})

    const {result} = renderHookWithInstance(() => useNavigate())

    await act(async () => {
      result.current({path: '/studios/xyz', scope: 'dashboard'})
    })

    expect(updates).toEqual([{url: '/studios/xyz', history: 'push'}])

    const to = {appId: 'app', path: 'documents/abc'}
    act(() => {
      emitLocation({
        appId: 'dashboard',
        path: 'dashboard',
        transition: {navigationType: 'push', to},
      })
      emitLocation({appId: 'app', path: 'documents/abc', transition: null})
    })
    // rxjs reports an error thrown by a subscriber on a later tick, not from emitLocation.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onUnhandledError).not.toHaveBeenCalled()
  })

  it('returns a referentially stable function across re-renders', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const {result, rerender} = renderHookWithInstance(() => useNavigate(vi.fn()))
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  // The host hides background apps in an `<Activity>`, which unmounts their effects.
  describe('while the app is in the background', () => {
    const startPath = 'documents/abc'

    // Flushes async reports.
    const settle = () => act(async () => {})

    const hostNavigatesTo = (path: string) => {
      const to = {appId: 'app', path}
      act(() => {
        emitLocation({appId: 'other', path: 'other', transition: {navigationType: 'push', to}})
        emitLocation({appId: 'app', path, transition: null})
      })
    }

    function renderInBackgroundableApp<T>(hook: () => T) {
      let mode: 'visible' | 'hidden' = 'visible'
      const wrapper = ({children}: {children: ReactNode}) => (
        <Activity mode={mode}>
          <AppProviders>{children}</AppProviders>
        </Activity>
      )
      const {result, rerender} = renderHookWithInstance(hook, {wrapper})
      const setMode = (next: typeof mode) => {
        mode = next
        rerender()
      }
      return {result, hide: () => setMode('hidden'), show: () => setMode('visible')}
    }

    beforeEach(() => {
      publishBasePath()
      emitLocation({appId: 'app', path: startPath, transition: null})
    })

    it('follows a host navigation into the app once it is shown again', () => {
      const navigateFn = vi.fn()
      const app = renderInBackgroundableApp(() => useNavigate(navigateFn))

      app.hide()
      hostNavigatesTo('documents/def')
      app.show()

      expect(navigateFn).toHaveBeenCalledTimes(1)
      expect(navigateFn).toHaveBeenCalledWith({path: 'documents/def', type: 'replace'})
    })

    it('does not navigate when the app is shown again where it was left', () => {
      const navigateFn = vi.fn()
      const app = renderInBackgroundableApp(() => useNavigate(navigateFn))

      app.hide()
      hostNavigatesTo(startPath)
      app.show()

      expect(navigateFn).not.toHaveBeenCalled()
    })

    it('does not report the location the app had before it was hidden', async () => {
      const app = renderInBackgroundableApp(() => useRoutedApp(startPath))
      await settle()
      updates = []

      app.hide()
      hostNavigatesTo('documents/def')
      app.show()
      await settle()

      expect(app.result.current).toBe('documents/def')
      expect(updates).toEqual([])
    })

    it('reports a later navigation back to where the app was before it was hidden', async () => {
      const app = renderInBackgroundableApp(() => useNavigate(vi.fn()))

      app.hide()
      hostNavigatesTo('documents/def')
      app.show()
      await settle()
      app.result.current({path: startPath})
      await settle()

      expect(updates).toEqual([{url: '/applications/app/documents/abc', history: 'push'}])
    })
  })
})
