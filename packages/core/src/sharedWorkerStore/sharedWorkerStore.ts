import {createStore} from 'zustand/vanilla'

import {
  type ActiveSubscription,
  type SharedWorkerStoreActions,
  type SharedWorkerStoreState,
} from './types'

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
