/**
 * Like `setTimeout`, but calls `.unref()` on the timer when running in Node.js.
 *
 * In Node.js, active timers prevent the process from exiting. Cleanup timers
 * (e.g. deferred subscription removal) should not keep the process alive -
 * `.unref()` lets the process exit naturally while still firing the timer if
 * the process happens to still be running.
 *
 * In browsers, `setTimeout` returns a number and has no `.unref()` method,
 * so this is a no-op there.
 */
export function setCleanupTimeout(fn: () => void, delay: number): ReturnType<typeof setTimeout> {
  const timer = setTimeout(fn, delay)

  // In Node.js, setTimeout returns an object with an `unref()` method.
  // In browsers, it returns a number. We assign to `unknown` and narrow
  // at runtime so this works in both environments without type assertions.
  const t: unknown = timer
  if (typeof t === 'object' && t !== null && 'unref' in t && typeof t.unref === 'function') {
    t.unref()
  }

  return timer
}
