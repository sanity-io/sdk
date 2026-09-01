import {beforeEach, describe, expect, it, vi} from 'vitest'

const connectMessageBus = vi.hoisted(() => vi.fn())

vi.mock('./bus', () => ({connectMessageBus}))

describe('dashboard message bus client', () => {
  beforeEach(() => {
    vi.resetModules()
    connectMessageBus.mockReset()
  })

  it('connects lazily once and reuses the client', async () => {
    const client = {}
    connectMessageBus.mockReturnValue(client)

    const dashboard = await import('./client')

    expect(connectMessageBus).not.toHaveBeenCalled()
    expect(dashboard.getDashboardMessageBus()).toBe(client)
    expect(connectMessageBus).toHaveBeenCalledOnce()
    expect(dashboard.isDashboardEnvironment()).toBe(true)
    expect(connectMessageBus).toHaveBeenCalledOnce()
  })

  it('retries after the host installs the message bus', async () => {
    connectMessageBus.mockReturnValue(undefined)

    const dashboard = await import('./client')

    expect(dashboard.getDashboardMessageBus()).toBeUndefined()
    expect(dashboard.isDashboardEnvironment()).toBe(false)

    const client = {}
    connectMessageBus.mockReturnValue(client)

    expect(dashboard.getDashboardMessageBus()).toBe(client)
    expect(dashboard.isDashboardEnvironment()).toBe(true)
    expect(connectMessageBus).toHaveBeenCalledTimes(3)
  })
})
