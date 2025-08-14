import {createStore} from 'zustand/vanilla'

import {
  type ActiveSubscription,
  type SharedWorkerStoreActions,
  type SharedWorkerStoreState,
} from './types'
import {areSubscriptionsEquivalent} from './utils/subscriptionManager'

/**
 * @internal
 * ServiceWorker store that manages subscriptions across SDK apps
 *
 * This store acts as a central registry for all active subscriptions,
 * allowing the ServiceWorker to track which apps are subscribed to which data
 * and coordinate updates accordingly.
 */
export const sharedWorkerStore = createStore<SharedWorkerStoreState & SharedWorkerStoreActions>(
  (set, get) => ({
    // Initial state
    subscriptions: new Map(),

    // Actions
    registerSubscription: (subscription) => {
      const state = get()

      // Check if we already have an equivalent subscription
      const existingSubscriptions = Array.from(state.subscriptions.values())
      const equivalentSubscription = existingSubscriptions.find((existing) =>
        areSubscriptionsEquivalent(existing, subscription),
      )

      if (equivalentSubscription) {
        // Return the existing subscription ID instead of creating a new one
        console.log(
          '[SharedWorkerStore] Found equivalent subscription, reusing:',
          equivalentSubscription.subscriptionId,
        )
        return equivalentSubscription.subscriptionId
      }

      // Create new subscription
      const activeSubscription: ActiveSubscription = {
        ...subscription,
        isActive: true,
        lastUpdate: Date.now(),
      }

      set((state) => {
        const newSubscriptions = new Map(state.subscriptions)
        newSubscriptions.set(subscription.subscriptionId, activeSubscription)

        return {
          subscriptions: newSubscriptions,
        }
      })

      console.log('[SharedWorkerStore] Created new subscription:', subscription.subscriptionId)
      return subscription.subscriptionId
    },

    unregisterSubscription: (subscriptionId) => {
      set((state) => {
        const newSubscriptions = new Map(state.subscriptions)
        newSubscriptions.delete(subscriptionId)

        return {
          subscriptions: newSubscriptions,
        }
      })
    },

    hasSubscription: (subscriptionId) => {
      const state = get()
      const subscription = state.subscriptions.get(subscriptionId)
      return subscription !== undefined && subscription.isActive
    },

    getSubscriptionCount: () => {
      const state = get()
      return Array.from(state.subscriptions.values()).filter((sub) => sub.isActive).length
    },

    getAllSubscriptions: () => {
      const state = get()
      return Array.from(state.subscriptions.values()).filter((sub) => sub.isActive)
    },
  }),
)

// Type assertion to ensure the store has the correct shape
/** @internal */
export type SharedWorkerStore = typeof sharedWorkerStore
