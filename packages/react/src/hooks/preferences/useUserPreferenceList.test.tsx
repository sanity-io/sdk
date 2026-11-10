import {getCurrentUserState} from '@sanity/sdk'
import {act} from '@testing-library/react'
import {type Observable, of, Subject} from 'rxjs'
import {beforeEach, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useUserPreferenceList} from './useUserPreferenceList'

// The hook runs on a real fetcher cache; only the read behind it is faked
const {read} = vi.hoisted(() => ({
  read: vi.fn<(options: {projectId?: string; pages?: number}) => Observable<unknown>>(),
}))
let run = 0

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  const {defineFetcher} = await import('@sanity/sdk/_internal')
  return {
    ...actual,
    getCurrentUserState: vi.fn(),
    userPreferenceList: defineFetcher<
      [userId: string, key: string, options?: {projectId?: string; pages?: number}],
      unknown
    >({
      name: 'test-paged-list',
      getKey: (_instance, userId, key, {projectId, pages = 1} = {}) =>
        `${run}:${userId}:${key}:${projectId}:${pages}`,
      fetch: () => (_userId, _key, options) => read(options ?? {}),
    }) as unknown as typeof actual.userPreferenceList,
  }
})

const QUERIES = 'studio.vision-tool.saved-queries'
const USER = {id: 'user-1'}
const item = (id: string) => ({
  itemId: id,
  value: {_key: id, url: '?query=*', savedAt: 't'},
  addedAt: 't',
  updatedAt: 't',
})

beforeEach(() => {
  run++
  read.mockReset()
  vi.mocked(getCurrentUserState).mockReturnValue({
    getCurrent: () => USER,
    subscribe: () => () => {},
    observable: of(USER),
  } as unknown as ReturnType<typeof getCurrentUserState>)
})

it("reads the first page of the signed-in user's items in the nearest resource's project", async () => {
  read.mockReturnValue(of({data: [item('q1')], hasMore: true}))

  const {result} = renderHook(() => useUserPreferenceList(QUERIES))

  await vi.waitFor(() => expect(result.current).toMatchObject({data: [item('q1')], hasMore: true}))
  expect(read).toHaveBeenCalledWith(expect.objectContaining({projectId: 'test', pages: 1}))
})

it('keeps the pages read so far on screen while it loads the next one', async () => {
  const next = new Subject<unknown>()
  read.mockImplementation(({pages}) =>
    pages === 1 ? of({data: [item('q1')], hasMore: true}) : next,
  )
  const {result} = renderHook(() => useUserPreferenceList(QUERIES))
  await vi.waitFor(() => expect(result.current?.data).toEqual([item('q1')]))

  await act(async () => result.current.loadMore())

  expect(result.current).toMatchObject({data: [item('q1')], isPending: true})
  await act(async () => next.next({data: [item('q1'), item('q2')], hasMore: false}))
  await vi.waitFor(() =>
    expect(result.current).toMatchObject({
      data: [item('q1'), item('q2')],
      hasMore: false,
      isPending: false,
    }),
  )
})

it('starts again from the first page for another project', async () => {
  read.mockReturnValue(of({data: [item('q1')], hasMore: true}))
  const {result, rerender} = renderHook(
    ({projectId}) => useUserPreferenceList(QUERIES, {projectId}),
    {initialProps: {projectId: 'a'}},
  )
  await vi.waitFor(() => expect(result.current?.data).toEqual([item('q1')]))
  await act(async () => result.current.loadMore())
  expect(read).toHaveBeenLastCalledWith(expect.objectContaining({projectId: 'a', pages: 2}))

  rerender({projectId: 'b'})

  await vi.waitFor(() =>
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({projectId: 'b', pages: 1})),
  )
})
