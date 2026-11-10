import {getCurrentUserState, type PreferenceKey, updateUserPreference} from '@sanity/sdk'
import {act} from '@testing-library/react'
import {of} from 'rxjs'
import {beforeEach, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useUpdateUserPreference} from './useUpdateUserPreference'

vi.mock(import('@sanity/sdk'), async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentUserState: vi.fn(),
  updateUserPreference: vi.fn(),
}))

const LAYOUT = 'studio.structure-tool.layout.book'
const USER = {id: 'user-1'}

beforeEach(() => {
  vi.mocked(getCurrentUserState).mockReturnValue({
    getCurrent: () => USER,
    subscribe: () => () => {},
    observable: of(USER),
  } as unknown as ReturnType<typeof getCurrentUserState>)
  vi.mocked(updateUserPreference).mockResolvedValue({
    key: LAYOUT,
    value: 'compact',
    isDefault: false,
    shared: false,
    resourceType: 'project',
    canEdit: true,
  })
})

it("changes the signed-in user's value in the nearest resource's project", async () => {
  const {result} = renderHook(() => useUpdateUserPreference(LAYOUT))

  await act(() => result.current.mutate('compact'))

  expect(updateUserPreference).toHaveBeenCalledWith(expect.anything(), {
    userId: 'user-1',
    key: LAYOUT,
    value: 'compact',
    projectId: 'test',
    resourceType: undefined,
    organizationId: undefined,
    shared: undefined,
  })
})

it('changes the shared value in the kind of resource and project the call names', async () => {
  // No declared key has a shared value yet, so any key's options are allowed
  const {result} = renderHook(() =>
    useUpdateUserPreference(LAYOUT as PreferenceKey, {
      resourceType: 'project',
      projectId: 'other',
      shared: true,
    }),
  )

  await act(() => result.current.mutate(undefined))

  expect(updateUserPreference).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      value: undefined,
      resourceType: 'project',
      projectId: 'other',
      shared: true,
    }),
  )
})

it('reports a refused change in error', async () => {
  const refused = new Error('refused')
  vi.mocked(updateUserPreference).mockRejectedValue(refused)
  const {result} = renderHook(() => useUpdateUserPreference(LAYOUT))

  await act(() => result.current.mutate('compact').catch(() => {}))

  expect(result.current.error).toBe(refused)
  expect(result.current.isPending).toBe(false)
})

it('keeps the same function across renders with an inline options object', () => {
  const {result, rerender} = renderHook(() => useUpdateUserPreference(LAYOUT, {projectId: 'other'}))
  const first = result.current.mutate

  rerender()

  expect(result.current.mutate).toBe(first)
})
