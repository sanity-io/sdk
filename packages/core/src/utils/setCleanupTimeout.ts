// Calls `.unref()` on a timer when running in Node.js. In Node.js, timers are
// objects with an `unref()` method; in browsers they are numbers. Narrow at
// runtime so this works in both environments without type assertions.
function unref(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void {
  const t: unknown = timer
  if (typeof t === 'object' && t !== null && 'unref' in t && typeof t.unref === 'function') {
    t.unref()
  }
}

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
  unref(timer)
  return timer
}

/**
 * Like `setInterval`, but calls `.unref()` on the timer when running in Node.js
 * so a recurring poll never keeps the process alive. See {@link setCleanupTimeout}
 * for why cleanup and background timers must not block process exit.
 */
export function setCleanupInterval(fn: () => void, delay: number): ReturnType<typeof setInterval> {
  const timer = setInterval(fn, delay)
  unref(timer)
  return timer
}
