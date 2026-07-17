import {organizations, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

vi.mock('@sanity/sdk', () => ({
  organizations: {
    getState: vi.fn(() => ({
      getCurrent: vi.fn(() => ({status: 'pending', data: undefined})),
    })),
    resolveState: vi.fn(),
  },
}))
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(),
}))

describe('useOrganizations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
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

  it('shouldSuspend suspends while the fetcher snapshot is pending', async () => {
    await import('./useOrganizations')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook.mock.calls.length).toBeGreaterThan(0)
    const {shouldSuspend} = mockCreateStateSourceHook.mock.calls[0][0]

    const mockInstance = {} as SanityInstance
    const result = shouldSuspend(mockInstance, undefined)

    expect(organizations.getState).toHaveBeenCalledWith(mockInstance, undefined)
    const organizationsStateMockResult = vi.mocked(organizations.getState).mock.results[0].value
    expect(organizationsStateMockResult.getCurrent).toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('should handle different parameter combinations in shouldSuspend', async () => {
    await import('./useOrganizations')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    const {shouldSuspend} = mockCreateStateSourceHook.mock.calls[0][0]

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
