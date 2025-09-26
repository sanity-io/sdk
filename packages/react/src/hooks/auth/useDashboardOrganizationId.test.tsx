import {createSanityInstance, getDashboardOrganizationId} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {throwError} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {useDashboardOrganizationId} from './useDashboardOrganizationId'

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn().mockReturnValue(createSanityInstance()),
}))

vi.mock('@sanity/sdk', async (importOriginal) => {
  const actual = await importOriginal()
  return {...(actual || {}), getDashboardOrganizationId: vi.fn()}
})

describe('useDashboardOrganizationId', () => {
  it('should return undefined when no organization ID is set', () => {
    const subscribe = vi.fn()
    vi.mocked(getDashboardOrganizationId).mockReturnValue({
      getCurrent: () => undefined,
      subscribe,
      observable: throwError(() => new Error('Unexpected usage of observable')),
    })

    const {result} = renderHook(() => useDashboardOrganizationId())
    expect(result.current).toBeUndefined()
  })

  it('should return organization ID when one is set', () => {
    const subscribe = vi.fn()
    const mockOrgId = 'team_123'
    vi.mocked(getDashboardOrganizationId).mockReturnValue({
      getCurrent: () => mockOrgId,
      subscribe,
      observable: throwError(() => new Error('Unexpected usage of observable')),
    })

    const {result} = renderHook(() => useDashboardOrganizationId())
    expect(result.current).toBe(mockOrgId)
  })
})
