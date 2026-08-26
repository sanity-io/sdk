import {type Organization, organization, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {type Observable} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useOrganization} from './useOrganization'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, organization: {getState: vi.fn(), resolveState: vi.fn(), refetch: vi.fn()}}
})

const stateSource = (
  current: Organization | undefined,
): StateSource<FetcherSnapshot<Organization>> => {
  const snapshot = current
    ? {status: 'success', data: current, error: undefined, isFetching: false, dataUpdatedAt: 1}
    : {
        status: 'pending',
        data: undefined,
        error: undefined,
        isFetching: true,
        dataUpdatedAt: undefined,
      }
  return {
    getCurrent: vi.fn(() => snapshot),
    subscribe: vi.fn(() => () => {}),
    get observable(): Observable<unknown> {
      throw new Error('Not implemented')
    },
  } as unknown as StateSource<FetcherSnapshot<Organization>>
}

const sanityInstance = expect.objectContaining({config: expect.any(Object)})

describe('useOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(organization.getState).mockReturnValue(
      stateSource({id: 'org_1'} as unknown as Organization),
    )
  })

  it('reads the organization fetcher with the passed options', () => {
    renderHook(() => useOrganization({organizationId: 'org_1'}))
    expect(organization.getState).toHaveBeenCalledWith(sanityInstance, {organizationId: 'org_1'})
  })

  it('returns the fetcher data in the result envelope', () => {
    const {result} = renderHook(() => useOrganization({organizationId: 'org_1'}))
    expect(result.current.data).toEqual({id: 'org_1'})
    expect(result.current.isFetching).toBe(false)
    expect(typeof result.current.refetch).toBe('function')
  })

  it('suspends via the organization fetcher until data is available', () => {
    vi.mocked(organization.getState).mockReturnValue(stateSource(undefined))
    vi.mocked(organization.resolveState).mockReturnValue(new Promise(() => {}))
    renderHook(() => useOrganization({organizationId: 'org_1'}))
    expect(organization.resolveState).toHaveBeenCalled()
  })
})
