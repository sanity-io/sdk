/**
 * Session-storage key tracking whether the SDK has already attempted an
 * automatic reload in response to a chunk-load error during this session.
 *
 * @internal
 */
export const CHUNK_RELOAD_STORAGE_KEY = '__sanity_sdk_chunk_reload_attempted'

/**
 * Returns true when this session has already triggered an automatic reload.
 * Returns false if session storage is unreadable.
 *
 * @internal
 */
export function readChunkReloadFlag(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
      return false
    }
    return window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Marks the session as having attempted an automatic reload, so the next
 * chunk-load error renders the manual reload UI instead of looping.
 *
 * @internal
 */
export function setChunkReloadFlag(): void {
  try {
    if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return
    window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, '1')
  } catch {
    // Storage may be unavailable (private mode quotas, disabled cookies).
    // Falling through means the user sees the manual-reload UI instead of an
    // automatic reload, which is the correct degradation.
  }
}

/**
 * Clears the chunk-reload flag. Called from SDKProvider once the SDK
 * mounts successfully past the error boundary so a future incident in the
 * same session can trigger another automatic reload.
 *
 * @internal
 */
export function clearChunkReloadFlag(): void {
  try {
    if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') return
    window.sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY)
  } catch {
    // No-op: see setChunkReloadFlag.
  }
}
