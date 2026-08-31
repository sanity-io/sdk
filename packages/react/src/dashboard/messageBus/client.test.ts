import {beforeEach, describe, expect, it, vi} from 'vitest'

const connectMessageBus = vi.hoisted(() => vi.fn())

vi.mock('./bus', () => ({connectMessageBus}))

describe('dashboard message bus client', () => {
  beforeEach(() => {
    vi.resetModules()
    connectMessageBus.mockReset()
  })

  it('connects once and reuses the client', async () => {
    const client = {}
    connectMessageBus.mockReturnValue(client)

    const dashboard = await import('./client')

    expect(connectMessageBus).toHaveBeenCalledOnce()
    expect(dashboard.dashboardMessageBus).toBe(client)
    expect(dashboard.isDashboardEnvironment()).toBe(true)
  })

  it('identifies standalone applications', async () => {
    connectMessageBus.mockReturnValue(undefined)

    const dashboard = await import('./client')

    expect(connectMessageBus).toHaveBeenCalledOnce()
    expect(dashboard.isDashboardEnvironment()).toBe(false)
  })
})
