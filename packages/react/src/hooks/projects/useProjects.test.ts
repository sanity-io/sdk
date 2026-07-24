import {type Project, projects, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {type Observable} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useProjects} from './useProjects'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, projects: {getState: vi.fn(), resolveState: vi.fn(), refetch: vi.fn()}}
})

const stateSource = (current: Project[] | undefined): StateSource<FetcherSnapshot<Project[]>> => {
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
  } as unknown as StateSource<FetcherSnapshot<Project[]>>
}

const sanityInstance = expect.objectContaining({config: expect.any(Object)})

describe('useProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(projects.getState).mockReturnValue(stateSource([{id: 'a'}] as unknown as Project[]))
  })

  it('reads the projects fetcher with the passed options', () => {
    renderHook(() => useProjects({organizationId: 'org123'}))
    expect(projects.getState).toHaveBeenCalledWith(sanityInstance, {organizationId: 'org123'})
  })

  it('returns the fetcher data in the result envelope', () => {
    const {result} = renderHook(() => useProjects())
    expect(result.current.data).toEqual([{id: 'a'}])
    expect(result.current.isFetching).toBe(false)
    expect(typeof result.current.refetch).toBe('function')
  })

  it('suspends via the projects fetcher until data is available', () => {
    vi.mocked(projects.getState).mockReturnValue(stateSource(undefined))
    vi.mocked(projects.resolveState).mockReturnValue(new Promise(() => {}))
    renderHook(() => useProjects())
    expect(projects.resolveState).toHaveBeenCalled()
  })
})
