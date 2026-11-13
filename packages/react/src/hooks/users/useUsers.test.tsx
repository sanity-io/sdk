import {ClientError} from '@sanity/client'
import {createSanityInstance, type SanityUser} from '@sanity/sdk'
import {act, renderHook as renderBareHook} from '@testing-library/react'
import {type ReactNode} from 'react'
import {type Observable, of, Subject, throwError} from 'rxjs'
import {beforeEach, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {ResourceProvider} from '../../context/ResourceProvider'
import {SanityInstanceContext} from '../../context/SanityInstanceContext'
import {useUsers} from './useUsers'

interface Options {
  resourceType?: 'organization' | 'project'
  projectId?: string
  organizationId?: string
  batchSize?: number
}
interface Page {
  data: SanityUser[]
  totalCount: number
  nextCursor: string | null
}

// The hook runs on a real fetcher cache; only the page read behind it is faked
const {read} = vi.hoisted(() => ({
  read: vi.fn<(options: Options, cursor: string | undefined) => Observable<Page>>(),
}))
let run = 0

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  const {definePagedFetcher} = await import('@sanity/sdk/_internal')
  return {
    ...actual,
    users: definePagedFetcher<[options?: Options], Page>({
      name: 'test-users',
      getKey: (_instance, options) => `${run}:${JSON.stringify(options)}`,
      fetch:
        () =>
        (cursor, options = {}) =>
          read(options, cursor),
    }) as unknown as typeof actual.users,
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
const sanityUsers = (ids: string[]) => ids.map(sanityUser)
const page = (ids: string[], nextCursor: string | null, totalCount = ids.length) =>
  of({data: sanityUsers(ids), totalCount, nextCursor})

beforeEach(() => {
  run++
  read.mockReset()
  read.mockReturnValue(page(['u1'], null))
})

it('shows the first page of the users, how many there are, and whether there are more', async () => {
  read.mockReturnValue(page(['u1'], 'c1', 2))

  const {result} = renderHook(() => useUsers({batchSize: 1}))

  await vi.waitFor(() =>
    expect(result.current).toMatchObject({
      data: sanityUsers(['u1']),
      totalCount: 2,
      hasMore: true,
      isPending: false,
    }),
  )
  expect(read).toHaveBeenCalledExactlyOnceWith({batchSize: 1, projectId: 'test'}, undefined)
})

it('keeps the users shown when the next page fails to load, and can load more again', async () => {
  // A 4xx, which isn't retried, so it shows at once
  const failure = new ClientError({statusCode: 400, headers: {}, body: {error: 'Bad Request'}})
  read.mockImplementation((_options, cursor) =>
    cursor ? throwError(() => failure) : page(['u1'], 'c1', 2),
  )
  const {result} = renderHook(() => useUsers())
  await vi.waitFor(() => expect(result.current?.data).toEqual(sanityUsers(['u1'])))

  await act(async () => result.current.loadMore())

  await vi.waitFor(() =>
    expect(result.current).toMatchObject({
      data: sanityUsers(['u1']),
      error: failure,
      isPending: false,
    }),
  )
  read.mockImplementation((_options, cursor) =>
    cursor ? page(['u2'], null, 2) : page(['u1'], 'c1', 2),
  )
  await act(async () => result.current.loadMore())
  await vi.waitFor(() =>
    expect(result.current).toMatchObject({
      data: sanityUsers(['u1', 'u2']),
      hasMore: false,
      error: undefined,
    }),
  )
})

it("keeps a list's users shown while another list loads", async () => {
  const next = new Subject<Page>()
  read.mockImplementation(({projectId}) => (projectId === 'b' ? next : page(['a1'], null)))
  const {result, rerender} = renderHook(({projectId}) => useUsers({projectId}), {
    initialProps: {projectId: 'a'},
  })
  await vi.waitFor(() => expect(result.current?.data).toEqual(sanityUsers(['a1'])))

  rerender({projectId: 'b'})

  expect(result.current).toMatchObject({data: sanityUsers(['a1']), isPending: true})
  await act(async () => next.next({data: sanityUsers(['b1']), totalCount: 1, nextCursor: null}))
  await vi.waitFor(() =>
    expect(result.current).toMatchObject({data: sanityUsers(['b1']), isPending: false}),
  )
})

it('reads the project of the nearest resource for a project-scoped list', async () => {
  renderBareHook(() => useUsers({resourceType: 'project'}), {
    wrapper: ({children}: {children: ReactNode}) => (
      <ResourceProvider
        resource={{projectId: 'resource-project', dataset: 'production'}}
        fallback={null}
      >
        {children}
      </ResourceProvider>
    ),
  })

  await vi.waitFor(() =>
    expect(read).toHaveBeenCalledWith(
      {resourceType: 'project', projectId: 'resource-project'},
      undefined,
    ),
  )
})

it("doesn't add the nearest resource's project to an organization's list", async () => {
  renderBareHook(() => useUsers({resourceType: 'organization', organizationId: 'test-org'}), {
    wrapper: ({children}: {children: ReactNode}) => (
      <ResourceProvider
        resource={{projectId: 'resource-project', dataset: 'production'}}
        fallback={null}
      >
        {children}
      </ResourceProvider>
    ),
  })

  await vi.waitFor(() =>
    expect(read).toHaveBeenCalledWith(
      {resourceType: 'organization', organizationId: 'test-org'},
      undefined,
    ),
  )
})

it('reads the project of a ResourceProvider when the instance has no project', async () => {
  const emptyInstance = createSanityInstance({})
  renderBareHook(() => useUsers(), {
    wrapper: ({children}: {children: ReactNode}) => (
      <SanityInstanceContext.Provider value={emptyInstance}>
        <ResourceProvider projectId="bare-project" fallback={null}>
          {children}
        </ResourceProvider>
      </SanityInstanceContext.Provider>
    ),
  })

  await vi.waitFor(() => expect(read).toHaveBeenCalledWith({projectId: 'bare-project'}, undefined))
})
