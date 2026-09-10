import {
  getOAuthTokensState,
  type OAuthTokens,
  refreshOAuthTokens,
  revokeOAuthTokens,
  type StateSource,
} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
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
function createFakeTokenSource(initial: OAuthTokens | null) {
  let current = initial
  const listeners = new Set<() => void>()
  const source: StateSource<OAuthTokens | null> & {set: (next: OAuthTokens | null) => void} = {
    subscribe: (onStoreChanged?: () => void) => {
      if (onStoreChanged) listeners.add(onStoreChanged)
      return () => {
        if (onStoreChanged) listeners.delete(onStoreChanged)
      }
    },
    getCurrent: () => current,
    observable: undefined as never,
    set: (next) => {
      current = next
      for (const listener of listeners) listener()
    },
  }
  return source
}

const makeTokens = (overrides: Partial<OAuthTokens> = {}): OAuthTokens => ({
  accessToken: 'access-token',
  tokenType: 'bearer',
  expiresIn: 3600,
  expiresAt: new Date(Date.now() + 3600_000),
  refreshToken: 'refresh-token',
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

    let returned: OAuthTokens | null = null
    await act(async () => {
      returned = await result.current.refresh()
    })

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(returned).toEqual(refreshed)
    expect(result.current.tokens).toEqual(refreshed)
  })

  it('resolves null from refresh when core has no refresh token, leaving tokens unchanged', async () => {
    const existing = makeTokens({refreshToken: undefined})
    const source = createFakeTokenSource(existing)
    mockGetState.mockReturnValue(source)
    // Core resolves null on the no-refresh-token path (it logs out separately);
    // it does not push a new token value here.
    mockRefresh.mockResolvedValue(null)

    const {result} = renderHook(() => useOAuthTokens(), {wrapper})

    let returned: OAuthTokens | null = existing
    await act(async () => {
      returned = await result.current.refresh()
    })

    expect(returned).toBeNull()
    expect(result.current.tokens).toEqual(existing)
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
