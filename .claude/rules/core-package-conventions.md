---
paths:
  - 'packages/core/src/**/*.ts'
---

# `packages/core` conventions

## Timers in cleanup/unsubscribe handlers

Use `setCleanupTimeout` (from `../utils/setCleanupTimeout`) instead of `setTimeout` for any timer whose purpose is deferred cleanup: subscription removal, state expiration, node release, and similar.

In Node.js, `setTimeout` keeps the process alive until the timer fires. Cleanup timers should never prevent process exit. `setCleanupTimeout` calls `.unref()` on the timer in Node.js so the process can exit naturally, while still firing the callback if the process is running for other reasons. In browsers, it behaves identically to `setTimeout`.

```ts
// Don't: keeps Node.js alive for the duration of the delay
return () => {
  setTimeout(() => {
    state.set('removeSubscription', cleanup(id))
  }, STATE_CLEAR_DELAY)
}

// Do: lets the process exit if nothing else is keeping it alive
return () => {
  setCleanupTimeout(() => {
    state.set('removeSubscription', cleanup(id))
  }, STATE_CLEAR_DELAY)
}
```
