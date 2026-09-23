import {type PathChangeMessage} from '@sanity/message-protocol'
import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {
  type MessageBusHost,
  type NavigationLocation,
  type ReplyOf,
  type ValueOf,
} from '@sanity/sdk/dashboard'
import {renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest'

import {act, renderHook as renderHookWithInstance} from '../../../test/test-utils'
import {useNavigate} from './useNavigate'

const mockFetch = vi.fn()
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
        fetch: mockFetch,
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

  it('reports an in-app navigation over the Comlink update-url message', async () => {
    mockFetch.mockResolvedValue({success: true})
    const {result} = renderHook(() => useNavigate(mockNavigateFn))

    await expect(result.current({path: 'documents/abc'})).resolves.toEqual({ok: true})

    // jsdom's origin is fixed at http://localhost:3000 in this test env.
    expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/bridge/listeners/history/update-url', {
      url: 'http://localhost:3000/documents/abc',
    })
  })

  it.each([
    ['refuses', () => mockFetch.mockResolvedValue({success: false})],
    ['never replies', () => mockFetch.mockRejectedValue(new Error('timeout'))],
  ])('resolves failed when the host %s', async (_, setup) => {
    setup()
    const {result} = renderHook(() => useNavigate(mockNavigateFn))

    await expect(result.current({path: 'documents/abc'})).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('drops a dashboard-scoped navigation with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => warn.mockRestore())
    const {result} = renderHook(() => useNavigate(mockNavigateFn))

    await expect(result.current({path: '/studios/abc', scope: 'dashboard'})).resolves.toEqual({
      ok: false,
      reason: 'not-navigable',
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('useNavigate (message bus)', () => {
  const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
  let host: MessageBusHost
  // The single navigation.location.update responder for the describe: it records every payload
  // and replies with whatever `updateReply` currently holds (or refuses on `'refuse'`), so a test
  // can force a not-ok reply without registering a second competing responder.
  let updates: {url: string; history?: string}[]
  let updateReply: ReplyOf<'navigation.location.update'> | 'refuse'

  const emitLocation = (value: NavigationLocation | null) =>
    host.connections.subscribe((client) =>
      client.emit('navigation.location', value as ValueOf<'navigation.location'>),
    )

  const publishBasePath = () =>
    host.connections.subscribe((client) =>
      client.emit('applications.base-path', {ok: true, value: '/applications/app'}),
    )

  beforeEach(() => {
    updates = []
    updateReply = {ok: true}
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
    host.subscribe('navigation.location.update', (message) => {
      updates.push(message.payload)
      if (updateReply === 'refuse') message.reject()
      else message.reply(updateReply)
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

  it('ignores the app’s own in-app change with no prior transition', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    renderHookWithInstance(() => useNavigate(navigateFn))

    act(() => {
      emitLocation({appId: 'app', path: 'documents/def', transition: null})
    })

    expect(navigateFn).not.toHaveBeenCalled()
  })

  it('emits navigation.location.update with the joined path and history for an outbound report', async () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    const {result} = renderHookWithInstance(() => useNavigate(navigateFn))

    await act(async () => {
      await expect(result.current({path: 'documents/def', type: 'replace'})).resolves.toEqual({
        ok: true,
      })
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

  it('does not echo the app’s own outbound report but still fires host-initiated commits', () => {
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

  it('fires a later host-mediated commit to the same path as a suppressed own report', () => {
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

    const hostTo = {appId: 'app', path: 'documents/def'}
    act(() => {
      emitLocation({
        appId: 'app',
        path: 'documents/def',
        transition: {navigationType: 'push', to: hostTo},
      })
      emitLocation({
        appId: 'app',
        path: 'documents/def',
        transition: {navigationType: 'push', to: hostTo},
      })
      emitLocation({appId: 'app', path: 'documents/def', transition: null})
    })

    expect(navigateFn).toHaveBeenCalledTimes(1)
    expect(navigateFn).toHaveBeenCalledWith({path: 'documents/def', type: 'push'})
  })

  it('fires a host commit to a path whose own report was rejected by the host', async () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})
    updateReply = {ok: false, reason: 'not-navigable'}

    const navigateFn = vi.fn()
    const {result} = renderHookWithInstance(() => useNavigate(navigateFn))

    await act(async () => {
      await expect(result.current({path: 'documents/def'})).resolves.toEqual({
        ok: false,
        reason: 'not-navigable',
      })
    })

    const hostTo = {appId: 'app', path: 'documents/def'}
    act(() => {
      emitLocation({
        appId: 'app',
        path: 'documents/abc',
        transition: {navigationType: 'push', to: hostTo},
      })
      emitLocation({
        appId: 'app',
        path: 'documents/def',
        transition: {navigationType: 'push', to: hostTo},
      })
      emitLocation({appId: 'app', path: 'documents/def', transition: null})
    })

    expect(navigateFn).toHaveBeenCalledTimes(1)
    expect(navigateFn).toHaveBeenCalledWith({path: 'documents/def', type: 'push'})
  })

  it('ignores a commit whose prior transition target path does not match', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    renderHookWithInstance(() => useNavigate(navigateFn))

    const to = {appId: 'app', path: 'a'}
    act(() => {
      emitLocation({appId: 'app', path: 'documents/abc', transition: {navigationType: 'push', to}})
      emitLocation({appId: 'app', path: 'b', transition: null})
    })

    expect(navigateFn).not.toHaveBeenCalled()
  })

  it('suppresses the echo of an own report made with a leading slash', () => {
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

  it('resolves failed with a warning when the host refuses the report', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => warn.mockRestore())
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})
    updateReply = 'refuse'

    const {result} = renderHookWithInstance(() => useNavigate(vi.fn()))

    await act(async () => {
      await expect(result.current({path: 'documents/def'})).resolves.toEqual({
        ok: false,
        reason: 'failed',
      })
    })

    expect(warn).toHaveBeenCalledOnce()
  })

  it('drops an outbound report when the base path is not ok and still fires a later host commit to that path', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => warn.mockRestore())
    host.connections.subscribe((client) => client.emit('applications.base-path', {ok: false}))
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const navigateFn = vi.fn()
    const {result} = renderHookWithInstance(() => useNavigate(navigateFn))

    await act(async () => {
      await expect(result.current({path: 'documents/def'})).resolves.toEqual({
        ok: false,
        reason: 'failed',
      })
    })

    expect(updates).toEqual([])
    expect(warn).toHaveBeenCalledOnce()

    const hostTo = {appId: 'app', path: 'documents/def'}
    act(() => {
      emitLocation({
        appId: 'app',
        path: 'documents/abc',
        transition: {navigationType: 'push', to: hostTo},
      })
      emitLocation({
        appId: 'app',
        path: 'documents/def',
        transition: {navigationType: 'push', to: hostTo},
      })
      emitLocation({appId: 'app', path: 'documents/def', transition: null})
    })

    expect(navigateFn).toHaveBeenCalledTimes(1)
    expect(navigateFn).toHaveBeenCalledWith({path: 'documents/def', type: 'push'})
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

  it('keeps a pending in-app echo suppressed across a dashboard-scoped report', () => {
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

  it('returns a referentially stable function across re-renders', () => {
    publishBasePath()
    emitLocation({appId: 'app', path: 'documents/abc', transition: null})

    const {result, rerender} = renderHookWithInstance(() => useNavigate(vi.fn()))
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })
})
