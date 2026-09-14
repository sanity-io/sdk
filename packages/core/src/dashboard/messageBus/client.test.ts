import {beforeEach, describe, expect, it, vi} from 'vitest'

const messageBus = vi.hoisted(() => ({
  connect: vi.fn(),
  installed: vi.fn(),
}))

vi.mock('./bus', () => ({
  connectMessageBus: messageBus.connect,
  isMessageBusInstalled: messageBus.installed,
}))

describe('dashboard message bus client', () => {
  beforeEach(() => {
    vi.resetModules()
    messageBus.connect.mockReset()
    messageBus.installed.mockReset()
  })

  it('connects lazily once and reuses the client', async () => {
    const client = {}
    messageBus.connect.mockReturnValue(client)
    messageBus.installed.mockReturnValue(true)

    const dashboard = await import('./client')

    expect(messageBus.connect).not.toHaveBeenCalled()
    expect(dashboard.getDashboardMessageBus()).toBe(client)
    expect(messageBus.connect).toHaveBeenCalledOnce()
    expect(dashboard.isDashboardEnvironment()).toBe(true)
    expect(messageBus.connect).toHaveBeenCalledOnce()
  })

  it('retries after the host installs the message bus', async () => {
    messageBus.installed.mockReturnValue(false)

    const dashboard = await import('./client')

    expect(dashboard.getDashboardMessageBus()).toBeUndefined()
    expect(dashboard.isDashboardEnvironment()).toBe(false)

    const client = {}
    messageBus.installed.mockReturnValue(true)
    messageBus.connect.mockReturnValue(client)

    expect(dashboard.getDashboardMessageBus()).toBe(client)
    expect(dashboard.isDashboardEnvironment()).toBe(true)
    expect(messageBus.connect).toHaveBeenCalledOnce()
  })

  it('does not report a dashboard environment when connection fails', async () => {
    messageBus.installed.mockReturnValue(true)
    messageBus.connect.mockReturnValue(undefined)

    const dashboard = await import('./client')

    expect(dashboard.isDashboardEnvironment()).toBe(false)
    expect(messageBus.connect).toHaveBeenCalledOnce()
  })
})
