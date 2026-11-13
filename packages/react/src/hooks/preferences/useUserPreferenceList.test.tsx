import {ClientError} from '@sanity/client'
import {getCurrentUserState} from '@sanity/sdk'
import {act} from '@testing-library/react'
import {type Observable, of, Subject, throwError} from 'rxjs'
import {beforeEach, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useUserPreferenceList} from './useUserPreferenceList'

// The hook runs on a real fetcher cache; only the page read behind it is faked
const {request} = vi.hoisted(() => ({
  request: vi.fn<(options: {projectId?: string; cursor?: string}) => Observable<unknown>>(),
}))

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  const {definePagedFetcher} = await import('@sanity/sdk/_internal')
  return {
    ...actual,
    getCurrentUserState: vi.fn(),
    userPreferenceList: definePagedFetcher<
      [userId: string, key: string, options?: {projectId?: string}],
      {data: unknown[]; nextCursor: string | null}
    >({
      name: 'test-paged-list',
      getKey: (_instance, userId, key, {projectId} = {}) => `${userId}:${key}:${projectId}`,
      fetch: () => (cursor, _userId, _key, options) =>
        request({projectId: options?.projectId, cursor}) as Observable<{
          data: unknown[]
          nextCursor: string | null
        }>,
    }) as unknown as typeof actual.userPreferenceList,
  }
})

const QUERIES = 'studio.vision-tool.saved-queries'
let run = 0
// A user per test, so no test reads a list another one cached
let user = {id: ''}
const item = (id: string) => ({
  itemId: id,
  value: {_key: id, url: '?query=*', savedAt: 't'},
  addedAt: 't',
  updatedAt: 't',
})
const page = (ids: string[], nextCursor: string | null) => of({data: ids.map(item), nextCursor})
const items = (ids: string[]) => ids.map(item)
const cursors = () => request.mock.calls.map(([{cursor}]) => cursor)

beforeEach(() => {
  user = {id: `user-${++run}`}
  request.mockReset()
  vi.mocked(getCurrentUserState).mockReturnValue({
    getCurrent: () => user,
    subscribe: () => () => {},
    observable: of(user),
  } as unknown as ReturnType<typeof getCurrentUserState>)
})

it("reads the first page of the signed-in user's items in the nearest resource's project", async () => {
  request.mockReturnValue(page(['q1'], 'c1'))

  const {result} = renderHook(() => useUserPreferenceList(QUERIES))

  await vi.waitFor(() => expect(result.current).toMatchObject({data: items(['q1']), hasMore: true}))
  expect(request).toHaveBeenCalledExactlyOnceWith({projectId: 'test', cursor: undefined})
})

it('reads only the next page on load more, keeping the items read so far on screen', async () => {
  const next = new Subject<unknown>()
  request.mockImplementation(({cursor}) => (cursor ? next : page(['q1'], 'c1')))
  const {result} = renderHook(() => useUserPreferenceList(QUERIES))
  await vi.waitFor(() => expect(result.current?.data).toEqual(items(['q1'])))

  await act(async () => result.current.loadMore())

  expect(result.current).toMatchObject({data: items(['q1']), isPending: true})
  await act(async () => next.next({data: [item('q2')], nextCursor: null}))
  await vi.waitFor(() =>
    expect(result.current).toMatchObject({
      data: items(['q1', 'q2']),
      hasMore: false,
      isPending: false,
    }),
  )
  expect(cursors()).toEqual([undefined, 'c1'])
})

it('keeps the items read so far on screen when the next page fails, and can try again', async () => {
  // A 4xx, which isn't retried, so it shows at once
  const failure = new ClientError({statusCode: 400, headers: {}, body: {error: 'Bad Request'}})
  request.mockImplementation(({cursor}) =>
    cursor ? throwError(() => failure) : page(['q1'], 'c1'),
  )
  const {result} = renderHook(() => useUserPreferenceList(QUERIES))
  await vi.waitFor(() => expect(result.current?.data).toEqual(items(['q1'])))

  await act(async () => result.current.loadMore())

  await vi.waitFor(() =>
    expect(result.current).toMatchObject({
      data: items(['q1']),
      error: expect.objectContaining({statusCode: 400}),
      isPending: false,
    }),
  )
  request.mockImplementation(({cursor}) => (cursor ? page(['q2'], null) : page(['q1'], 'c1')))
  await act(async () => result.current.loadMore())
  await vi.waitFor(() =>
    expect(result.current).toMatchObject({data: items(['q1', 'q2']), error: undefined}),
  )
})

it('reads the next page once when load more is pressed twice before it arrives', async () => {
  const next = new Subject<unknown>()
  request.mockImplementation(({cursor}) => (cursor ? next : page(['q1'], 'c1')))
  const {result} = renderHook(() => useUserPreferenceList(QUERIES))
  await vi.waitFor(() => expect(result.current?.data).toEqual(items(['q1'])))

  await act(async () => result.current.loadMore())
  await act(async () => result.current.loadMore())
  await act(async () => next.next({data: [item('q2')], nextCursor: 'c2'}))

  await vi.waitFor(() =>
    expect(result.current).toMatchObject({data: items(['q1', 'q2']), isPending: false}),
  )
  expect(cursors()).toEqual([undefined, 'c1'])
})

it('refetches every page read so far, as one list', async () => {
  request.mockImplementation(({cursor}) => (cursor ? page(['q2'], null) : page(['q1'], 'c1')))
  const {result} = renderHook(() => useUserPreferenceList(QUERIES))
  await vi.waitFor(() => expect(result.current?.data).toEqual(items(['q1'])))
  await act(async () => result.current.loadMore())
  await vi.waitFor(() => expect(result.current?.data).toEqual(items(['q1', 'q2'])))

  let refetched: unknown
  await act(async () => {
    refetched = await result.current.refetch()
  })

  expect(refetched).toEqual({data: items(['q1', 'q2']), nextCursor: null})
})

it('starts again from the first page for another project', async () => {
  request.mockImplementation(({projectId = '', cursor}) =>
    cursor ? page([`${projectId}-2`], null) : page([projectId], `${projectId}-c1`),
  )
  const {result, rerender} = renderHook(
    ({projectId}) => useUserPreferenceList(QUERIES, {projectId}),
    {initialProps: {projectId: 'a'}},
  )
  await vi.waitFor(() => expect(result.current?.data).toEqual(items(['a'])))
  await act(async () => result.current.loadMore())
  await vi.waitFor(() => expect(result.current?.data).toEqual(items(['a', 'a-2'])))

  rerender({projectId: 'b'})

  await vi.waitFor(() => expect(result.current?.data).toEqual(items(['b'])))
  await act(async () => result.current.loadMore())
  await vi.waitFor(() => expect(result.current?.data).toEqual(items(['b', 'b-2'])))
})
