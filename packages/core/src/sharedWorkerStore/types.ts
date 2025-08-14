/**
 * @internal
 * Types for the SharedWorker store that manages subscriptions across SDK apps
 */

/**
 * @internal
 * Represents a subscription request from an SDK app
 */
export interface SubscriptionRequest {
  /** Unique identifier for this subscription */
  subscriptionId: string
  /** Name of the store this subscription is for (e.g., 'query', 'document') */
  storeName: string
  /** Project ID this subscription belongs to */
  projectId: string
  /** Dataset this subscription belongs to */
  dataset: string
  /** Store-specific parameters (e.g., query string, document ID) */
  params?: Record<string, unknown>
  /** Timestamp when subscription was created */
  createdAt: number
  /** Application ID of the subscription request */
  appId: string
}

/**
 * @internal
 * Represents an active subscription in the SharedWorker
 */
export interface ActiveSubscription extends SubscriptionRequest {
  /** Whether this subscription is currently active */
  isActive: boolean
  /** Last time this subscription received an update */
  lastUpdate?: number
}

/**
 * @internal
 * State of the SharedWorker store
 */
export interface SharedWorkerStoreState {
  /** Map of active subscriptions by their ID */
  subscriptions: Map<string, ActiveSubscription>
}

/**
 * @internal
 * Actions that can be performed on the SharedWorker store
 */
export interface SharedWorkerStoreActions {
  /** Register a new subscription */
  registerSubscription: (subscription: SubscriptionRequest) => void
  /** Unregister a subscription */
  unregisterSubscription: (subscriptionId: string) => void
  /** Check if a subscription exists */
  hasSubscription: (subscriptionId: string) => boolean
  /** Get total count of active subscriptions */
  getSubscriptionCount: () => number
  /** Get all active subscriptions */
  getAllSubscriptions: () => ActiveSubscription[]
}
