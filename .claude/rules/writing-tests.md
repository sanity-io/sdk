---
paths:
  - 'packages/**/src/**/*.test.ts'
  - 'packages/**/src/**/*.test.tsx'
---

# Writing Tests

## Waiting in tests

Every wait in a test needs a reason you can point to in the code under test. Before writing one, trace the call to the work it waits for. If that work runs synchronously, assert straight away.

- To wait until something happens, use `vi.waitFor`.
- To show something hasn't happened yet, like a request that should still be queued, fake the timers and `await vi.runAllTimersAsync()` before the assertion. It fires every pending timer, whatever its delay, and settles the promises in between, so work that is only delayed shows up. `vi.waitFor` can't show that something hasn't happened, and a zero-delay `setTimeout` only lets zero-delay work run.
- `vi.runAllTimersAsync()` fires every pending timer, not only the ones the test is about. A cache entry nobody subscribes to is garbage collected, because the clock jumps to its collection time. A subscribed entry with a `refetchInterval` makes it abort after 10,000 timers. Subscribe to the entries the test reads, and where an interval runs, use `vi.advanceTimersByTimeAsync(ms)` with a bound you can name.
- Fake the timers the code under test schedules with. In `packages/core`, rxjs's `timer` and `delay` use `setInterval`, so faking only `setTimeout` misses them. React tests that suspend fake only `setTimeout` and `clearTimeout`: React's scheduler runs on `setImmediate`, and faking it stalls Suspense.
- Don't add `await Promise.resolve()` or `await new Promise((resolve) => setTimeout(resolve, 0))` in case they're needed. Delete each wait and rerun: if the test behaves the same, the wait goes.

```ts
// Don't: passes for a change that's sent 10ms late without waiting for the one before
void save(instance, 'X')
void save(instance, 'Y')
await new Promise((resolve) => setTimeout(resolve, 0))
expect(sent).toEqual(['X'])

// Do: a change that's only delayed, not queued, has gone by the assertion
vi.useFakeTimers()
void save(instance, 'X')
void save(instance, 'Y')
await vi.runAllTimersAsync()
expect(sent).toEqual(['X'])
```
