import {ClientError} from '@sanity/client'
import {type InstallationsOptions} from '@sanity/sdk'
import {act} from '@testing-library/react'
import {type Observable, of, throwError} from 'rxjs'
import {beforeEach, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useInstallations} from './useInstallations'

interface Page {
  data: {id: string}[]
  nextCursor: string | null
}

// The hook runs on a real fetcher cache; only the page read behind it is faked
const {read} = vi.hoisted(() => ({
  read: vi.fn<(cursor: string | undefined) => Observable<Page>>(),
}))
let run = 0

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  const {definePagedFetcher} = await import('@sanity/sdk/_internal')
  return {
    ...actual,
    installations: definePagedFetcher<[options: InstallationsOptions], Page>({
      name: 'test-installations',
      getKey: (_instance, options) => `${run}:${JSON.stringify(options)}`,
      fetch: () => (cursor) => read(cursor),
    }) as unknown as typeof actual.installations,
  }
})

const page = (ids: string[], nextCursor: string | null) =>
  of({data: ids.map((id) => ({id})), nextCursor})
const insts = (ids: string[]) => ids.map((id) => ({id}))

beforeEach(() => {
  run++
  read.mockReset()
})

it('loads more installations until there are none left, showing each once', async () => {
  const pages: Record<string, Observable<Page>> = {
    first: page(['i1', 'i2'], 'c1'),
    c1: page(['i3'], 'c2'),
    c2: page(['i4'], null),
  }
  read.mockImplementation((cursor) => pages[cursor ?? 'first']!)
  const {result} = renderHook(() => useInstallations({organizationId: 'org1', limit: 2}))
  await vi.waitFor(() =>
    expect(result.current).toMatchObject({
      data: {data: insts(['i1', 'i2']), nextCursor: 'c1'},
      hasMore: true,
    }),
  )

  await act(async () => result.current.loadMore())
  await vi.waitFor(() => expect(result.current.data.data).toHaveLength(3))
  await act(async () => result.current.loadMore())

  await vi.waitFor(() =>
    expect(result.current).toMatchObject({
      data: {data: insts(['i1', 'i2', 'i3', 'i4']), nextCursor: null},
      hasMore: false,
    }),
  )
})

it('keeps the installations shown when the next page fails to load, and can load more again', async () => {
  // A 4xx, which isn't retried, so it shows at once
  const failure = new ClientError({statusCode: 400, headers: {}, body: {error: 'Bad Request'}})
  read.mockImplementation((cursor) => (cursor ? throwError(() => failure) : page(['i1'], 'c1')))
  const {result} = renderHook(() => useInstallations({organizationId: 'org1'}))
  await vi.waitFor(() => expect(result.current?.data.data).toEqual(insts(['i1'])))

  await act(async () => result.current.loadMore())

  await vi.waitFor(() =>
    expect(result.current).toMatchObject({
      data: {data: insts(['i1'])},
      error: failure,
      isPending: false,
    }),
  )
  read.mockImplementation((cursor) => (cursor ? page(['i2'], null) : page(['i1'], 'c1')))
  await act(async () => result.current.loadMore())
  await vi.waitFor(() =>
    expect(result.current).toMatchObject({data: {data: insts(['i1', 'i2'])}, error: undefined}),
  )
})
