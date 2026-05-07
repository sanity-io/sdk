import {getOrganizationsState, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

vi.mock('@sanity/sdk', () => ({
  getOrganizationsState: vi.fn(() => ({
    getCurrent: vi.fn(() => undefined),
  })),
  resolveOrganizations: vi.fn(),
}))
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(),
}))

describe('useOrganizations', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mock('@sanity/sdk', () => ({
      getOrganizationsState: vi.fn(() => ({
        getCurrent: vi.fn(() => undefined),
      })),
      resolveOrganizations: vi.fn(),
    }))
    vi.mock('../helpers/createStateSourceHook', () => ({
      createStateSourceHook: vi.fn(),
    }))
  })

  it('should call createStateSourceHook with correct arguments on import', async () => {
    await import('./useOrganizations')

    expect(createStateSourceHook).toHaveBeenCalled()
    expect(createStateSourceHook).toHaveBeenCalledWith(
      expect.objectContaining({
        getState: expect.any(Function),
        shouldSuspend: expect.any(Function),
        suspender: expect.any(Function),
      }),
    )
  })

  it('shouldSuspend should call getOrganizationsState and getCurrent', async () => {
    await import('./useOrganizations')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook.mock.calls.length).toBeGreaterThan(0)
    const createStateSourceHookArgs = mockCreateStateSourceHook.mock.calls[0][0]
    const shouldSuspend = createStateSourceHookArgs.shouldSuspend

    const mockInstance = {} as SanityInstance

    const result = shouldSuspend(mockInstance, undefined)

    const mockGetOrganizationsState = getOrganizationsState as ReturnType<typeof vi.fn>
    expect(mockGetOrganizationsState).toHaveBeenCalledWith(mockInstance, undefined)

    expect(mockGetOrganizationsState.mock.results.length).toBeGreaterThan(0)
    const getOrganizationsStateMockResult = mockGetOrganizationsState.mock.results[0].value
    expect(getOrganizationsStateMockResult.getCurrent).toHaveBeenCalled()

    expect(result).toBe(true)
  })

  it('should handle different parameter combinations in shouldSuspend', async () => {
    await import('./useOrganizations')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    const createStateSourceHookArgs = mockCreateStateSourceHook.mock.calls[0][0]
    const shouldSuspend = createStateSourceHookArgs.shouldSuspend

    const mockInstance = {} as SanityInstance

    expect(() => shouldSuspend(mockInstance, undefined)).not.toThrow()
    expect(() => shouldSuspend(mockInstance, {includeMembers: true})).not.toThrow()
    expect(() => shouldSuspend(mockInstance, {includeFeatures: true})).not.toThrow()
    expect(() =>
      shouldSuspend(mockInstance, {
        includeMembers: true,
        includeFeatures: true,
        includeImplicitMemberships: true,
      }),
    ).not.toThrow()
  })
})
