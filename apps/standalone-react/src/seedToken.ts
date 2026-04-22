// Small helpers for poking at the token the SDK reads out of localStorage.
// Useful for manually exercising auth flows (expired tokens, logged-out
// redirects, etc.) without having to actually let a real token expire.

const STORAGE_KEY = '__sanity_auth_token'

function writeToken(token: string) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({token}))
}

export function clearToken(): void {
  window.localStorage.removeItem(STORAGE_KEY)
}

// Writes a syntactically valid but unauthorized stamped-looking token. The
// `-st` substring is how the SDK identifies stamped tokens (see
// `packages/core/src/auth/utils.ts`). Standalone logins always produce
// stamped tokens, so this matches the real expiration shape.
export function seedExpiredToken(): void {
  writeToken('sk-bogus-expired-st-0000000000000000000000000000000000000000')
}

// Run at startup, before SDKProvider mounts, so `getStandaloneInitialState`
// picks up whatever we put in localStorage.
export function maybeSeedExpiredTokenFromUrl(): void {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('expire')) return
  seedExpiredToken()
}
