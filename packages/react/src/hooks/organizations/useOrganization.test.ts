import {organization, type OrganizationOptions, type SanityInstance} from '@sanity/sdk'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

vi.mock('@sanity/sdk', () => ({
  organization: {
    getState: vi.fn(() => ({
      getCurrent: vi.fn(() => ({status: 'pending', data: undefined})),
    })),
    resolveState: vi.fn(),
  },
}))
vi.mock('../helpers/createStateSourceHook', () => ({
  createStateSourceHook: vi.fn(),
}))

describe('useOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
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

  it('shouldSuspend suspends while the fetcher snapshot is pending', async () => {
    await import('./useOrganization')

    const mockCreateStateSourceHook = createStateSourceHook as ReturnType<typeof vi.fn>
    expect(mockCreateStateSourceHook.mock.calls.length).toBeGreaterThan(0)
    const {shouldSuspend} = mockCreateStateSourceHook.mock.calls[0][0]

    const mockInstance = {} as SanityInstance
    const mockOptions: OrganizationOptions = {organizationId: 'org_1'}

    const result = shouldSuspend(mockInstance, mockOptions)

    expect(organization.getState).toHaveBeenCalledWith(mockInstance, mockOptions)
    const organizationStateMockResult = vi.mocked(organization.getState).mock.results[0].value
    expect(organizationStateMockResult.getCurrent).toHaveBeenCalled()
    expect(result).toBe(true)
  })
})
