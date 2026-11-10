import {updateUserPreferenceListItem, getCurrentUserState} from '@sanity/sdk'
import {act} from '@testing-library/react'
import {of} from 'rxjs'
import {beforeEach, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useUpdateUserPreferenceList} from './useUpdateUserPreferenceList'

vi.mock(import('@sanity/sdk'), async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUserState: vi.fn(),
  updateUserPreferenceListItem: vi.fn(),
}))

const QUERIES = 'studio.vision-tool.saved-queries'
const USER = {id: 'user-1'}
const QUERY = {_key: 'q1', url: '?query=*', savedAt: 't'}

beforeEach(() => {
  vi.mocked(getCurrentUserState).mockReturnValue({
    getCurrent: () => USER,
    subscribe: () => () => {},
    observable: of(USER),
  } as unknown as ReturnType<typeof getCurrentUserState>)
  vi.mocked(updateUserPreferenceListItem).mockResolvedValue(undefined)
})

it("saves the item for the signed-in user in the nearest resource's project", async () => {
  const {result} = renderHook(() => useUpdateUserPreferenceList(QUERIES))

  await act(() => result.current.mutate({itemId: 'q1', value: QUERY}))

  expect(updateUserPreferenceListItem).toHaveBeenCalledWith(expect.anything(), {
    userId: 'user-1',
    key: QUERIES,
    itemId: 'q1',
    value: QUERY,
    resourceType: undefined,
    projectId: 'test',
    organizationId: undefined,
    shared: undefined,
  })
})

it('removes the item in the project the call names', async () => {
  const {result} = renderHook(() => useUpdateUserPreferenceList(QUERIES, {projectId: 'other'}))

  await act(() => result.current.mutate({itemId: 'q1', value: undefined}))

  expect(updateUserPreferenceListItem).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({itemId: 'q1', value: undefined, projectId: 'other'}),
  )
})

it('reports a refused change in error', async () => {
  const refused = new Error('refused')
  vi.mocked(updateUserPreferenceListItem).mockRejectedValue(refused)
  const {result} = renderHook(() => useUpdateUserPreferenceList(QUERIES))

  await act(() => result.current.mutate({itemId: 'q1', value: QUERY}).catch(() => {}))

  expect(result.current.error).toBe(refused)
  expect(result.current.isPending).toBe(false)
})

it('keeps the same function across renders with an inline options object', () => {
  const {result, rerender} = renderHook(() =>
    useUpdateUserPreferenceList(QUERIES, {projectId: 'other'}),
  )
  const first = result.current.mutate

  rerender()

  expect(result.current.mutate).toBe(first)
})
