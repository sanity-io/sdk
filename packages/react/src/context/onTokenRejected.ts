import {type SanityInstance} from '@sanity/sdk'
import {getIsTokenRejectedState} from '@sanity/sdk/_internal'
import {EMPTY, type Subscription, switchMap, timer} from 'rxjs'

/**
 * How often to ask the host for a new token while the API keeps rejecting the
 * current one. Also the minimum gap between two requests, so a host that hands
 * back tokens the API rejects can't cause a request loop.
 */
const REJECTED_TOKEN_REFRESH_INTERVAL = 60_000

/**
 * When each instance last asked for a new token. Kept per instance rather than
 * per subscription so the gap holds when a provider re-subscribes or remounts.
 */
const lastRefreshByInstance = new WeakMap<SanityInstance, number>()

/**
 * Calls `refresh` when a request is rejected because the current token's
 * session expired, and again every minute until a new token is set.
 *
 * @internal
 */
export function onTokenRejected(instance: SanityInstance, refresh: () => void): Subscription {
  return getIsTokenRejectedState(instance)
    .observable.pipe(
      switchMap((rejected) => {
        if (!rejected) return EMPTY
        const lastRefresh = lastRefreshByInstance.get(instance) ?? 0
        return timer(
          Math.max(0, lastRefresh + REJECTED_TOKEN_REFRESH_INTERVAL - Date.now()),
          REJECTED_TOKEN_REFRESH_INTERVAL,
        )
      }),
    )
    .subscribe(() => {
      lastRefreshByInstance.set(instance, Date.now())
      refresh()
    })
}
