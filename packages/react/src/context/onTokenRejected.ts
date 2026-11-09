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
 * Calls `refresh` when a request is rejected because the current token's
 * session expired, and again every minute until a new token is set.
 *
 * @internal
 */
export function onTokenRejected(instance: SanityInstance, refresh: () => void): Subscription {
  let lastRefresh = 0
  return getIsTokenRejectedState(instance)
    .observable.pipe(
      switchMap((rejected) =>
        rejected
          ? timer(
              Math.max(0, lastRefresh + REJECTED_TOKEN_REFRESH_INTERVAL - Date.now()),
              REJECTED_TOKEN_REFRESH_INTERVAL,
            )
          : EMPTY,
      ),
    )
    .subscribe(() => {
      lastRefresh = Date.now()
      refresh()
    })
}
