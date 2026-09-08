import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../../store/createSanityInstance'
import {type MessageBusConnection} from './bus'
import {getDashboardEnvironmentState, getDashboardMessageBus, isDashboardEnvironment} from './store'

const bus = vi.hoisted(() => ({
  connect: vi.fn(),
  installed: vi.fn(),
}))

vi.mock('./bus', () => ({
  connectMessageBus: bus.connect,
  isMessageBusInstalled: bus.installed,
}))

interface FakeConnection extends MessageBusConnection {
  moduleId?: string
  disconnected: boolean
}

const createFakeConnection = (moduleId?: string): FakeConnection => {
  const connection = {
    moduleId,
    disconnected: false,
    disconnect: () => {
      connection.disconnected = true
    },
  } as FakeConnection
  return connection
}

const config = {projectId: 'p', dataset: 'd'}

describe('dashboard message bus store', () => {
  beforeEach(() => {
    bus.connect.mockReset()
    bus.installed.mockReset()
    bus.installed.mockReturnValue(true)
    bus.connect.mockImplementation((options?: {moduleId?: string}) =>
      createFakeConnection(options?.moduleId),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('connects one bus per instance with distinct module identity', () => {
    const a = createSanityInstance(config)
    const b = createSanityInstance(config)

    const busA = getDashboardMessageBus(a, 'favorites/views/list/main') as FakeConnection
    const busB = getDashboardMessageBus(b, 'favorites/views/list/panel') as FakeConnection

    expect(busA).not.toBe(busB)
    expect(busA.moduleId).toBe('favorites/views/list/main')
    expect(busB.moduleId).toBe('favorites/views/list/panel')
    expect(bus.connect).toHaveBeenCalledTimes(2)

    a.dispose()
    b.dispose()
  })

  it('reuses the cached connection for the same instance', () => {
    const instance = createSanityInstance(config)

    const first = getDashboardMessageBus(instance)
    const second = getDashboardMessageBus(instance)

    expect(first).toBe(second)
    expect(bus.connect).toHaveBeenCalledOnce()

    instance.dispose()
  })

  it('forwards an absent module id so the bus applies its app id fallback', () => {
    const instance = createSanityInstance(config)

    getDashboardMessageBus(instance)

    // The fallback itself lives in connectApplicationToMessageBus (covered in bus.test.ts);
    // the store's job is only to pass the option through unchanged.
    expect(bus.connect).toHaveBeenCalledWith({moduleId: undefined})

    instance.dispose()
  })

  it('does not report a dashboard environment when the connection fails', () => {
    const instance = createSanityInstance(config)
    bus.connect.mockReturnValue(undefined)

    expect(getDashboardMessageBus(instance)).toBeUndefined()
    expect(isDashboardEnvironment(instance)).toBe(false)

    // A failed connect is not cached, so a later successful connect still lands.
    bus.connect.mockImplementation((options?: {moduleId?: string}) =>
      createFakeConnection(options?.moduleId),
    )
    expect(getDashboardMessageBus(instance)).toBeDefined()
    expect(isDashboardEnvironment(instance)).toBe(true)

    instance.dispose()
  })

  it('disconnects only the disposed instance', () => {
    const a = createSanityInstance(config)
    const b = createSanityInstance(config)

    const busA = getDashboardMessageBus(a) as FakeConnection
    const busB = getDashboardMessageBus(b) as FakeConnection

    a.dispose()

    expect(busA.disconnected).toBe(true)
    expect(busB.disconnected).toBe(false)

    b.dispose()
    expect(busB.disconnected).toBe(true)
  })

  it('returns undefined without caching when no bus is installed, then connects later', () => {
    const instance = createSanityInstance(config)
    bus.installed.mockReturnValue(false)

    expect(getDashboardMessageBus(instance)).toBeUndefined()
    expect(bus.connect).not.toHaveBeenCalled()

    bus.installed.mockReturnValue(true)
    expect(getDashboardMessageBus(instance)).toBeDefined()
    expect(bus.connect).toHaveBeenCalledOnce()

    instance.dispose()
  })

  it('reflects connection state through the environment state source', () => {
    const connected = createSanityInstance(config)
    const disconnected = createSanityInstance(config)
    bus.installed.mockReturnValue(false)
    getDashboardMessageBus(disconnected)

    bus.installed.mockReturnValue(true)
    getDashboardMessageBus(connected)

    expect(getDashboardEnvironmentState(connected).getCurrent()).toBe(true)
    expect(getDashboardEnvironmentState(disconnected).getCurrent()).toBe(false)

    connected.dispose()
    disconnected.dispose()
  })

  it('reports the dashboard environment once the instance connects', () => {
    const instance = createSanityInstance(config)

    bus.installed.mockReturnValue(false)
    expect(isDashboardEnvironment(instance)).toBe(false)

    bus.installed.mockReturnValue(true)
    getDashboardMessageBus(instance)
    expect(isDashboardEnvironment(instance)).toBe(true)

    instance.dispose()
  })
})
