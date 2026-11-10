import {
  getCurrentUserState,
  type PreferenceKey,
  userPreference,
  whenOrganizationKnown,
} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {act} from '@testing-library/react'
import {BehaviorSubject, of} from 'rxjs'
import {beforeEach, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useUserPreference} from './useUserPreference'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getCurrentUserState: vi.fn(),
    userPreference: {...actual.userPreference, getState: vi.fn(), resolveState: vi.fn()},
    whenOrganizationKnown: vi.fn(),
  }
})

const LAYOUT = 'studio.structure-tool.layout.book'
const USER = {id: 'user-1'}

beforeEach(() => {
  vi.mocked(getCurrentUserState).mockReturnValue({
    getCurrent: () => USER,
    subscribe: () => () => {},
    observable: of(USER),
  } as unknown as ReturnType<typeof getCurrentUserState>)
  const snapshot: FetcherSnapshot<unknown> = {
    status: 'success',
    data: {key: LAYOUT, value: 'compact', isDefault: false, shared: false, resourceType: 'project'},
    error: undefined,
    isFetching: false,
    dataUpdatedAt: 1,
  }
  vi.mocked(userPreference.getState).mockReturnValue({
    getCurrent: () => snapshot,
    subscribe: () => () => {},
    observable: of(snapshot),
  } as unknown as ReturnType<typeof userPreference.getState>)
})

it("reads the signed-in user's value in the nearest resource's project", () => {
  const {result} = renderHook(() => useUserPreference(LAYOUT))

  expect(result.current.data).toEqual({
    key: LAYOUT,
    value: 'compact',
    isDefault: false,
    shared: false,
    resourceType: 'project',
  })
  expect(userPreference.getState).toHaveBeenCalledWith(expect.anything(), 'user-1', LAYOUT, {
    projectId: 'test',
    organizationId: undefined,
  })
})

it('reads from the project the call names', () => {
  renderHook(() => useUserPreference(LAYOUT, {projectId: 'other'}))

  expect(userPreference.getState).toHaveBeenCalledWith(expect.anything(), 'user-1', LAYOUT, {
    projectId: 'other',
    organizationId: undefined,
  })
})

it('passes `shared` and `resourceType` on to the read', () => {
  // No declared key has a shared value yet, so any key's options are allowed
  renderHook(() =>
    useUserPreference(LAYOUT as PreferenceKey, {resourceType: 'project', shared: true}),
  )

  expect(userPreference.getState).toHaveBeenCalledWith(
    expect.anything(),
    'user-1',
    LAYOUT,
    expect.objectContaining({projectId: 'test', resourceType: 'project', shared: true}),
  )
})

it("suspends until the Dashboard's organization is known, then reads the value", async () => {
  let organizationKnown!: () => void
  const waiting = new Promise<void>((resolve) => (organizationKnown = resolve))
  vi.mocked(whenOrganizationKnown).mockReturnValue(waiting)

  const {result} = renderHook(() => useUserPreference(LAYOUT))
  expect(result.current).toBeNull()
  expect(userPreference.getState).not.toHaveBeenCalled()

  vi.mocked(whenOrganizationKnown).mockReturnValue(undefined)
  await act(async () => organizationKnown())

  expect(result.current.data).toMatchObject({value: 'compact'})
  expect(whenOrganizationKnown).toHaveBeenLastCalledWith(expect.anything(), LAYOUT, undefined)
})

it("suspends until the signed-in user is known, then reads that user's value", async () => {
  const user$ = new BehaviorSubject<{id: string} | null>(null)
  vi.mocked(getCurrentUserState).mockReturnValue({
    getCurrent: () => user$.getValue(),
    subscribe: (onChange?: () => void) => {
      const subscription = user$.subscribe(() => onChange?.())
      return () => subscription.unsubscribe()
    },
    observable: user$,
  } as unknown as ReturnType<typeof getCurrentUserState>)

  const {result} = renderHook(() => useUserPreference(LAYOUT))
  expect(result.current).toBeNull()
  expect(userPreference.getState).not.toHaveBeenCalled()

  await act(async () => user$.next(USER))

  expect(result.current.data).toMatchObject({value: 'compact'})
  expect(userPreference.getState).toHaveBeenCalledWith(
    expect.anything(),
    'user-1',
    LAYOUT,
    expect.anything(),
  )
})
