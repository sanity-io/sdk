import {type Observable, Subject} from 'rxjs'

const channels = new Map<string, Subject<void>>()

/**
 * Asks the query store for a resource to refetch its active queries now.
 *
 * The document store calls this when the Actions API acknowledges a transaction. That
 * response arrives once the change is visible to queries, about a second before the Live
 * Content API reports it. Requests are keyed by the resource's store name (for example
 * `projectId.dataset`), the same key the stores use: Sanity instances that use the same
 * resource share one query store, so they share this channel too. Neither store has to create
 * the other, and a request with no open channel is dropped because no queries are active.
 *
 * @internal
 */
export function requestQueryRefresh(resourceName: string): void {
  channels.get(resourceName)?.next()
}

/**
 * Opens the refresh channel for a resource's query store. It stays open until `close` is
 * called, so queries can resubscribe (for example after every live event) without a request
 * landing while nothing is listening.
 *
 * @internal
 */
export function openQueryRefreshChannel(resourceName: string): {
  requests: Observable<void>
  close: () => void
} {
  const channel = new Subject<void>()
  channels.set(resourceName, channel)
  return {
    requests: channel.asObservable(),
    close: () => {
      if (channels.get(resourceName) === channel) channels.delete(resourceName)
    },
  }
}
