import {type GetUserOptions, type SanityUser} from '@sanity/sdk'
import {act} from '@testing-library/react'
import {type Observable, of, Subject} from 'rxjs'
import {beforeEach, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useUser} from './useUser'

// The hook runs on a real fetcher cache; only the read behind it is faked
const {read} = vi.hoisted(() => ({
  read: vi.fn<(options: GetUserOptions) => Observable<SanityUser | undefined>>(),
}))
let run = 0

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  const {defineFetcher} = await import('@sanity/sdk/_internal')
  return {
    ...actual,
    user: defineFetcher<[options: GetUserOptions], SanityUser | undefined>({
      name: 'test-user',
      getKey: (_instance, options) => `${run}:${JSON.stringify(options)}`,
      fetch: () => read,
    }) as unknown as typeof actual.user,
  }
})

const sanityUser = (id: string): SanityUser => ({
  sanityUserId: id,
  profile: {
    id,
    displayName: `User ${id}`,
    email: `${id}@example.com`,
    provider: 'google',
    createdAt: '2023-01-01T00:00:00Z',
  },
  memberships: [],
})

beforeEach(() => {
  run++
  read.mockReset()
})

it('shows the user', async () => {
  read.mockReturnValue(of(sanityUser('g1')))

  const {result} = renderHook(() => useUser({userId: 'g1', projectId: 'p1'}))

  await vi.waitFor(() => expect(result.current).toEqual({data: sanityUser('g1'), isPending: false}))
  expect(read).toHaveBeenCalledWith({userId: 'g1', projectId: 'p1'})
})

it('keeps a user shown while another one loads', async () => {
  const next = new Subject<SanityUser>()
  read.mockImplementation(({userId}) => (userId === 'g2' ? next : of(sanityUser('g1'))))
  const {result, rerender} = renderHook(({userId}) => useUser({userId, projectId: 'p1'}), {
    initialProps: {userId: 'g1'},
  })
  await vi.waitFor(() => expect(result.current?.data).toEqual(sanityUser('g1')))

  rerender({userId: 'g2'})

  expect(result.current).toEqual({data: sanityUser('g1'), isPending: true})
  await act(async () => next.next(sanityUser('g2')))
  await vi.waitFor(() => expect(result.current).toEqual({data: sanityUser('g2'), isPending: false}))
})
