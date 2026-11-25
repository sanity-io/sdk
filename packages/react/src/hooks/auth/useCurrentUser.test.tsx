import {type CurrentUser, currentUser, getCurrentUserState, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {Suspense} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {act, render, renderHook, screen} from '../../../test/test-utils'
import {useCurrentUser} from './useCurrentUser'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getCurrentUserState: vi.fn(),
    currentUser: {getState: vi.fn(), resolveState: vi.fn()},
  }
})

const authUser: CurrentUser = {
  id: 'gX7a2bQ9c',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'administrator',
  roles: [],
}
const userWithAttributes: CurrentUser<true> = {
  ...authUser,
  attributes: [{key: 'team', type: 'string', value: 'marketing'}],
}

function source<T>(initial: T) {
  let current = initial
  const listeners = new Set<() => void>()

  return {
    getCurrent: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    emit: (next: T) => {
      current = next
      listeners.forEach((listener) => listener())
    },
  }
}

function fetcherSource(snapshot: Partial<FetcherSnapshot<CurrentUser<boolean>>>) {
  return source({
    status: 'success',
    data: userWithAttributes,
    error: undefined,
    isFetching: false,
    dataUpdatedAt: 1,
    ...snapshot,
  } as FetcherSnapshot<CurrentUser<boolean>>)
}

function mockFetcher(snapshot: Partial<FetcherSnapshot<CurrentUser<boolean>>> = {}) {
  const fetcher = fetcherSource(snapshot)
  vi.mocked(currentUser.getState).mockReturnValue(
    fetcher as unknown as StateSource<FetcherSnapshot<CurrentUser<boolean>>>,
  )

  return fetcher
}

describe('useCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCurrentUserState).mockReturnValue(
      source(authUser) as unknown as StateSource<CurrentUser | null>,
    )
    mockFetcher()
  })

  it('returns the authenticated user without requesting /users/me when includeUserAttributes is unset', () => {
    const {result} = renderHook(() => useCurrentUser())

    expect(result.current).toBe(authUser)
    expect(currentUser.getState).not.toHaveBeenCalled()
  })

  it('returns the user with attributes when includeUserAttributes is true', () => {
    const {result} = renderHook(() =>
      useCurrentUser({includeUserAttributes: true, organizationId: 'oSyH1iET5'}),
    )

    expect(result.current).toBe(userWithAttributes)
    expect(currentUser.getState).toHaveBeenCalledWith(expect.anything(), {
      includeUserAttributes: true,
      organizationId: 'oSyH1iET5',
    })
  })

  it('re-renders with the refetched user', () => {
    const fetcher = mockFetcher()
    const {result} = renderHook(() => useCurrentUser({includeUserAttributes: true}))
    const refetched: CurrentUser<true> = {...userWithAttributes, attributes: []}

    act(() =>
      fetcher.emit({...fetcher.getCurrent(), data: refetched} as FetcherSnapshot<
        CurrentUser<boolean>
      >),
    )

    expect(result.current).toBe(refetched)
  })

  it('shows the Suspense fallback until the user with attributes has loaded', () => {
    mockFetcher({status: 'pending', data: undefined})
    vi.mocked(currentUser.resolveState).mockReturnValue(new Promise(() => {}))

    function Name() {
      return <>{useCurrentUser({includeUserAttributes: true})?.name}</>
    }

    render(
      <Suspense fallback="Loading user">
        <Name />
      </Suspense>,
    )

    expect(screen.getByText('Loading user')).toBeInTheDocument()
    expect(currentUser.resolveState).toHaveBeenCalledWith(expect.anything(), {
      includeUserAttributes: true,
    })
  })

  it('throws the fetch error to the error boundary', () => {
    const error = new Error('Request failed with status 500')
    mockFetcher({status: 'error', data: undefined, error})

    expect(() => renderHook(() => useCurrentUser({includeUserAttributes: true}))).toThrow(error)
  })
})
