import {checkPermissions, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {type Observable} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useCheckPermissions} from './useCheckPermissions'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    checkPermissions: {getState: vi.fn(), resolveState: vi.fn(), refetch: vi.fn()},
  }
})

const stateSource = (
  current: Record<string, boolean>,
): StateSource<FetcherSnapshot<Record<string, boolean>>> => {
  const snapshot = {
    status: 'success',
    data: current,
    error: undefined,
    isFetching: false,
    dataUpdatedAt: 1,
  }
  return {
    getCurrent: vi.fn(() => snapshot),
    subscribe: vi.fn(() => () => {}),
    get observable(): Observable<unknown> {
      throw new Error('Not implemented')
    },
  } as unknown as StateSource<FetcherSnapshot<Record<string, boolean>>>
}

const sanityInstance = expect.objectContaining({config: expect.any(Object)})

describe('useCheckPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkPermissions.getState).mockReturnValue(stateSource({'sanity.project.read': true}))
  })

  it('forwards every param to the fetcher and returns the permission map', () => {
    const {result} = renderHook(() =>
      useCheckPermissions('project', 'proj_1', ['sanity.project.read']),
    )
    expect(checkPermissions.getState).toHaveBeenCalledWith(sanityInstance, 'project', 'proj_1', [
      'sanity.project.read',
    ])
    expect(result.current.data).toEqual({'sanity.project.read': true})
  })
})
