import {Observable, Subject} from 'rxjs'

const refreshRequests = new Map<string, Subject<void>>()

/**
 * Asks the query store for a resource to refetch its active queries now.
 *
 * The document store calls this when the Actions API acknowledges a transaction. That
 * response arrives once the change is visible to queries, about a second before the Live
 * Content API reports it. The channel is keyed by store name so neither store has to create
 * the other: read-only apps never start a document store, and writes made before any query
 * is active have nothing to refresh.
 *
 * @internal
 */
export function requestQueryRefresh(resourceName: string): void {
  refreshRequests.get(resourceName)?.next()
}

/** @internal */
export function observeQueryRefreshRequests(resourceName: string): Observable<void> {
  return new Observable<void>((subscriber) => {
    const requests = refreshRequests.get(resourceName) ?? new Subject<void>()
    refreshRequests.set(resourceName, requests)
    const subscription = requests.subscribe(subscriber)
    return () => {
      subscription.unsubscribe()
      if (!requests.observed) refreshRequests.delete(resourceName)
    }
  })
}
