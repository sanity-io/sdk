import {
  getOAuthTokensState,
  type OAuthTokens,
  refreshOAuthTokens,
  revokeOAuthTokens,
  type StateSource,
} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useOAuthTokens} from './useOAuthTokens'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getOAuthTokensState: vi.fn(),
    refreshOAuthTokens: vi.fn(),
    revokeOAuthTokens: vi.fn(),
  }
})

/**
 * A controllable stand-in for core's token state source. `set` mimics core
 * updating the store (refresh/revoke or a cross-tab `storage` event) and
 * notifies subscribers so the hook re-renders.
 */
function createFakeTokenSource(initial: Omit<OAuthTokens, 'refreshToken'> | null) {
  let current = initial
  const listeners = new Set<() => void>()
  const source: StateSource<Omit<OAuthTokens, 'refreshToken'> | null> & {
    set: (next: Omit<OAuthTokens, 'refreshToken'> | null) => void
  } = {
    subscribe: (onStoreChanged?: () => void) => {
      if (onStoreChanged) listeners.add(onStoreChanged)
      return () => {
        if (onStoreChanged) listeners.delete(onStoreChanged)
      }
    },
    getCurrent: () => current,
    observable: throwError(() => new Error('unexpected usage of observable')),
    set: (next) => {
      current = next
      for (const listener of listeners) listener()
    },
  }
  return source
}

const makeTokens = (
  overrides: Partial<Omit<OAuthTokens, 'refreshToken'>> = {},
): Omit<OAuthTokens, 'refreshToken'> => ({
  accessToken: 'access-token',
  tokenType: 'bearer',
  expiresIn: 3600,
  expiresAt: new Date(Date.now() + 3600_000),
  ...overrides,
})

const wrapper = ({children}: {children: React.ReactNode}) => (
  <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
    {children}
  </ResourceProvider>
)

describe('useOAuthTokens', () => {
  const mockGetState = vi.mocked(getOAuthTokensState)
  const mockRefresh = vi.mocked(refreshOAuthTokens)
  const mockRevoke = vi.mocked(revokeOAuthTokens)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the stored tokens with isExpired=false when expiresAt is in the future', () => {
    const tokens = makeTokens()
    mockGetState.mockReturnValue(createFakeTokenSource(tokens))

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    expect(result.current.tokens).toEqual(tokens)
    expect(result.current.isExpired()).toBe(false)
  })

  it('derives isExpired=true when expiresAt is in the past', () => {
    mockGetState.mockReturnValue(
      createFakeTokenSource(makeTokens({expiresAt: new Date(Date.now() - 1000)})),
    )

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    expect(result.current.isExpired()).toBe(true)
  })

  it('treats expiresAt exactly equal to now as expired (<= boundary)', () => {
    vi.useFakeTimers()
    const now = new Date('2030-01-01T00:00:00.000Z')
    vi.setSystemTime(now)
    mockGetState.mockReturnValue(createFakeTokenSource(makeTokens({expiresAt: new Date(now)})))

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    expect(result.current.isExpired()).toBe(true)
  })

  it('re-evaluates isExpired against the clock at call time, with no re-render or token change', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
    const expiresAt = new Date(Date.now() + 10_000)
    mockGetState.mockReturnValue(createFakeTokenSource(makeTokens({expiresAt})))

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})
    const {isExpired} = result.current
    expect(isExpired()).toBe(false)

    // Advance past expiry. The same function reference must now report expired,
    // proving the read happens at call time, not render time.
    vi.setSystemTime(new Date(expiresAt.getTime() + 1000))
    expect(isExpired()).toBe(true)
  })

  it('isExpired reads the current tokens at call time, not the render-time snapshot', async () => {
    const source = createFakeTokenSource(makeTokens({expiresAt: new Date(Date.now() - 1000)}))
    mockGetState.mockReturnValue(source)
    const fresh = makeTokens({accessToken: 'new'})
    mockRefresh.mockImplementation(() => {
      source.set(fresh)
      return Promise.resolve(fresh)
    })

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})
    // Capture the references from the first render, as a consumer's event
    // handler would when it destructures the hook result.
    const {isExpired, refresh} = result.current
    expect(isExpired()).toBe(true)

    await act(async () => {
      await refresh()
    })

    expect(result.current.isExpired()).toBe(false)
    // The captured reference must agree: it should not "cache" the stale tokens.
    expect(isExpired()).toBe(false)
  })

  it('returns tokens=null and isExpired=false when there are no tokens', () => {
    mockGetState.mockReturnValue(createFakeTokenSource(null))

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    expect(result.current.tokens).toBeNull()
    expect(result.current.isExpired()).toBe(false)
  })

  it('calls core refreshOAuthTokens and re-renders with the new tokens', async () => {
    const source = createFakeTokenSource(makeTokens())
    mockGetState.mockReturnValue(source)
    const refreshed = makeTokens({accessToken: 'refreshed-token'})
    mockRefresh.mockImplementation(() => {
      source.set(refreshed)
      return Promise.resolve(refreshed)
    })

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    let returned: Omit<OAuthTokens, 'refreshToken'> | null = null
    await act(async () => {
      returned = await result.current.refresh()
    })

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(returned).toEqual(refreshed)
    expect(result.current.tokens).toEqual(refreshed)
  })

  it('resolves null from refresh when core has no refresh token, and tokens become null', async () => {
    const existing = makeTokens()
    const source = createFakeTokenSource(existing)
    mockGetState.mockReturnValue(source)
    // Core clears stored tokens and logs out on the no-refresh-token path.
    mockRefresh.mockImplementation(() => {
      source.set(null)
      return Promise.resolve(null)
    })

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    let returned: Omit<OAuthTokens, 'refreshToken'> | null = existing
    await act(async () => {
      returned = await result.current.refresh()
    })

    expect(returned).toBeNull()
    expect(result.current.tokens).toBeNull()
  })

  it('propagates a rejected refresh and leaves tokens unchanged', async () => {
    const existing = makeTokens()
    mockGetState.mockReturnValue(createFakeTokenSource(existing))
    mockRefresh.mockRejectedValue(new Error('network'))

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow('network')
    })

    expect(result.current.tokens).toEqual(existing)
  })

  it('propagates an unrecoverable refresh rejection after core has cleared tokens', async () => {
    const source = createFakeTokenSource(makeTokens())
    mockGetState.mockReturnValue(source)
    // Core clears stored tokens and logs out before rethrowing a 4xx.
    mockRefresh.mockImplementation(() => {
      source.set(null)
      return Promise.reject(new Error('invalid_grant'))
    })

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow('invalid_grant')
    })

    expect(result.current.tokens).toBeNull()
  })

  it('calls core revokeOAuthTokens and re-renders with tokens=null', async () => {
    const source = createFakeTokenSource(makeTokens())
    mockGetState.mockReturnValue(source)
    mockRevoke.mockImplementation(() => {
      source.set(null)
      return Promise.resolve()
    })

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    await act(async () => {
      await result.current.revoke()
    })

    expect(mockRevoke).toHaveBeenCalledTimes(1)
    expect(result.current.tokens).toBeNull()
  })

  it('re-renders when tokens change externally (e.g. another tab)', () => {
    const source = createFakeTokenSource(null)
    mockGetState.mockReturnValue(source)

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})
    expect(result.current.tokens).toBeNull()

    const otherTabTokens = makeTokens({accessToken: 'other-tab-token'})
    act(() => {
      source.set(otherTabTokens)
    })

    expect(result.current.tokens).toEqual(otherTabTokens)
  })
})
