import {type Organizations, organizations, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {type Observable} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useOrganizations} from './useOrganizations'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, organizations: {getState: vi.fn(), resolveState: vi.fn(), refetch: vi.fn()}}
})

const stateSource = (
  current: Organizations | undefined,
): StateSource<FetcherSnapshot<Organizations>> => {
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
  } as unknown as StateSource<FetcherSnapshot<Organizations>>
}

const sanityInstance = expect.objectContaining({config: expect.any(Object)})

describe('useOrganizations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(organizations.getState).mockReturnValue(
      stateSource([{id: 'org_1'}] as unknown as Organizations),
    )
  })

  it('reads the organizations fetcher with the passed options', () => {
    renderHook(() => useOrganizations({includeMembers: true}))
    expect(organizations.getState).toHaveBeenCalledWith(sanityInstance, {includeMembers: true})
  })

  it('returns the fetcher data in the result envelope', () => {
    const {result} = renderHook(() => useOrganizations())
    expect(result.current.data).toEqual([{id: 'org_1'}])
    expect(result.current.isFetching).toBe(false)
    expect(typeof result.current.refetch).toBe('function')
  })

  it('suspends via the organizations fetcher until data is available', () => {
    vi.mocked(organizations.getState).mockReturnValue(stateSource(undefined))
    vi.mocked(organizations.resolveState).mockReturnValue(new Promise(() => {}))
    renderHook(() => useOrganizations())
    expect(organizations.resolveState).toHaveBeenCalled()
  })
})
