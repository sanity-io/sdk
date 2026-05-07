import {getOrganizationState, type OrganizationOptions, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

vi.mock('@sanity/sdk', () => ({
  getOrganizationState: vi.fn(() => ({
    getCurrent: vi.fn(() => undefined),
  })),
  resolveOrganization: vi.fn(),
}))
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(),
}))

describe('useOrganization', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mock('@sanity/sdk', () => ({
      getOrganizationState: vi.fn(() => ({
        getCurrent: vi.fn(() => undefined),
      })),
      resolveOrganization: vi.fn(),
    }))
    vi.mock('../helpers/createStateSourceHook', () => ({
      createStateSourceHook: vi.fn(),
    }))
  })

  it('should call createStateSourceHook with correct arguments on import', async () => {
    await import('./useOrganization')

    expect(createStateSourceHook).toHaveBeenCalled()
    expect(createStateSourceHook).toHaveBeenCalledWith(
      expect.objectContaining({
        getState: expect.any(Function),
        shouldSuspend: expect.any(Function),
        suspender: expect.any(Function),
      }),
    )
  })

  it('shouldSuspend should call getOrganizationState and getCurrent', async () => {
    await import('./useOrganization')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook.mock.calls.length).toBeGreaterThan(0)
    const createStateSourceHookArgs = mockCreateStateSourceHook.mock.calls[0][0]
    const shouldSuspend = createStateSourceHookArgs.shouldSuspend

    const mockInstance = {} as SanityInstance
    const mockOptions: OrganizationOptions = {organizationId: 'org_1'}

    const result = shouldSuspend(mockInstance, mockOptions)

    const mockGetOrganizationState = getOrganizationState as ReturnType<typeof vi.fn>
    expect(mockGetOrganizationState).toHaveBeenCalledWith(mockInstance, mockOptions)

    expect(mockGetOrganizationState.mock.results.length).toBeGreaterThan(0)
    const getOrganizationStateMockResult = mockGetOrganizationState.mock.results[0].value
    expect(getOrganizationStateMockResult.getCurrent).toHaveBeenCalled()

    expect(result).toBe(true)
  })
})
