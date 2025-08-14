import {type ActiveSubscription, type SubscriptionRequest} from '../types'

/**
 * @internal
 * Utility functions for managing subscriptions in the SharedWorker store
 */

/**
 * @internal
 * Creates a unique subscription ID
 * @returns A unique string identifier
 */
export function createSubscriptionId(): string {
  return `sw-sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * @internal
 * Creates a subscription request object
 * @param options - Configuration for the subscription
 * @returns A properly formatted subscription request
 */
export function createSubscriptionRequest(options: {
  storeName: string
  projectId: string
  dataset: string
  params?: Record<string, unknown>
  subscriptionId?: string
  appId: string
}): SubscriptionRequest {
  return {
    subscriptionId: options.subscriptionId || createSubscriptionId(),
    storeName: options.storeName,
    projectId: options.projectId,
    dataset: options.dataset,
    params: options.params || {},
    createdAt: Date.now(),
    appId: options.appId,
  }
}

/**
 * @internal
 * Checks if two subscriptions are equivalent (same store, project, dataset, and params)
 * @param sub1 - First subscription
 * @param sub2 - Second subscription
 * @returns True if subscriptions are equivalent
 */
export function areSubscriptionsEquivalent(
  sub1: SubscriptionRequest,
  sub2: SubscriptionRequest,
): boolean {
  return (
    sub1.storeName === sub2.storeName &&
    sub1.projectId === sub2.projectId &&
    sub1.dataset === sub2.dataset &&
    JSON.stringify(sub1.params) === JSON.stringify(sub2.params)
  )
}

/**
 * @internal
 * Groups subscriptions by their parameters for efficient lookup
 * @param subscriptions - Array of active subscriptions
 * @returns Map of parameter hash to subscription IDs
 */
export function groupSubscriptionsByParams(
  subscriptions: ActiveSubscription[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>()

  for (const subscription of subscriptions) {
    const paramHash = JSON.stringify(subscription.params || {})
    if (!groups.has(paramHash)) {
      groups.set(paramHash, [])
    }
    groups.get(paramHash)!.push(subscription.subscriptionId)
  }

  return groups
}
