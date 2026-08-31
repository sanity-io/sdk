import {from, type Observable, of} from 'rxjs'
import {catchError, switchMap} from 'rxjs/operators'

// The dashboard host installs its shared message bus on this well-known global
// symbol before it loads federated remotes.
const OS_BUS_KEY = Symbol.for('sanity.os.bus')

/**
 * Whether this app is running inside the dashboard, embedded in its window.
 *
 * Federation shares the host's realm, so the installed bus is visible on
 * `globalThis`. This is `false` in a standalone app, where the message bus must
 * stay out of the bundle. The Core UI iframe uses the dashboard context instead.
 *
 * @internal
 */
export function isDashboardEnvironment(): boolean {
  return typeof globalThis === 'object' && OS_BUS_KEY in globalThis
}

/**
 * Observes the session token issued by the dashboard "OS", tracking the OS auth
 * state over time.
 *
 * Returns `undefined` when the app is not embedded in the dashboard, so the
 * caller uses its normal auth flow. Inside the dashboard, subscribes to the
 * `auth.token` state topic, emitting the current token — or `null` when the OS
 * is signed out — and re-emitting as the OS auth state changes, so sign-in/out
 * propagates instead of being captured once. Any bus error is treated as "no
 * token" (`null`). The token is used in-memory only and never persisted.
 *
 * @internal
 */
export function observeDashboardToken(): Observable<string | null> | undefined {
  if (!isDashboardEnvironment()) return undefined

  return from(import('../dashboard/messageBus/bus')).pipe(
    switchMap(({createMessageBus}) => createMessageBus().subscribe('auth.token')),
    // Any failure (importing the bus, or the subscription) means "no OS token".
    catchError(() => of(null)),
  )
}

/**
 * Asks the dashboard "OS" to reissue the session token, e.g. after its current
 * one was rejected with a 401. Fire-and-forget: the reissued token arrives via
 * the `auth.token` subscription in {@link observeDashboardToken}. No-op outside
 * the dashboard.
 *
 * @internal
 */
export function refreshDashboardToken(): void {
  if (!isDashboardEnvironment()) return

  void import('../dashboard/messageBus/bus').then(
    ({createMessageBus}) => {
      createMessageBus().emit('auth.token.refresh', undefined)
    },
    () => {},
  )
}
