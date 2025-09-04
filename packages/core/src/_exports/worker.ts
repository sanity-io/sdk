/// <reference lib="webworker" />
/* eslint-disable no-console */

/**
 * @internal
 * SharedWorker for managing subscriptions across SDK apps
 */

import {createClient} from '@sanity/client'

import {sharedWorkerStore} from '../sharedWorkerStore/sharedWorkerStore'
import {type SubscriptionRequest} from '../sharedWorkerStore/types'

declare const self: SharedWorkerGlobalScope

// Cache to store query results
const queryCache = new Map<
  string,
  {
    result: unknown
    timestamp: number
    subscribers: Set<MessagePort>
  }
>()

// Helper to create stable cache keys
function getCacheKey(subscription: SubscriptionRequest): string {
  const {projectId, dataset, params} = subscription
  return JSON.stringify({projectId, dataset, params})
}

console.log('[SharedWorker] Worker script loaded')

// Handle new connections
self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0]

  console.log('[SharedWorker] New connection established')

  // Set up message handling for this port
  port.onmessage = async (e: MessageEvent) => {
    const {type, data} = e.data

    console.log('[SharedWorker] Received message:', type, data)

    try {
      switch (type) {
        case 'REGISTER_SUBSCRIPTION':
          handleRegisterSubscription(data, port)
          break
        case 'UNREGISTER_SUBSCRIPTION':
          handleUnregisterSubscription(data.subscriptionId, port)
          break
        case 'GET_SUBSCRIPTION_COUNT':
          handleGetSubscriptionCount(port)
          break
        case 'GET_ALL_SUBSCRIPTIONS':
          handleGetAllSubscriptions(port)
          break
        default:
          console.warn('[SharedWorker] Unknown message type:', type)
          port.postMessage({
            type: 'ERROR',
            data: {error: `Unknown message type: ${type}`},
          })
      }
    } catch (error) {
      console.error('[SharedWorker] Error handling message:', error)
      port.postMessage({
        type: 'ERROR',
        data: {error: (error as Error).message},
      })
    }
  }

  // Start the port
  port.start()
  console.log('[SharedWorker] Port started, sending welcome message')
  port.postMessage({type: 'welcome'})
}

/**
 * @internal
 * Handle the registration of a subscription
 * @param subscription - The subscription to register
 * @param port - The port to send the response to
 */
function handleRegisterSubscription(subscription: SubscriptionRequest, port: MessagePort): void {
  try {
    // Register the subscription in the store
    sharedWorkerStore.getState().registerSubscription(subscription)

    // Check if we need to execute a query for this subscription
    if (subscription.storeName === 'query' && subscription.params?.['query']) {
      handleQuerySubscription(subscription, port)
    } else {
      // For non-query subscriptions, just confirm registration
      port.postMessage({
        type: 'SUBSCRIPTION_REGISTERED',
        data: {subscriptionId: subscription.subscriptionId},
      })
    }

    console.log('[SharedWorker] Registered subscription:', subscription.subscriptionId)
  } catch (error) {
    console.error('[SharedWorker] Failed to register subscription:', error)

    // Send error back to the client
    port.postMessage({
      type: 'SUBSCRIPTION_ERROR',
      data: {error: (error as Error).message, subscriptionId: subscription.subscriptionId},
    })
  }
}

/**
 * @internal
 * Handle query subscription - execute the query and cache results
 */
async function handleQuerySubscription(
  subscription: SubscriptionRequest,
  port: MessagePort,
): Promise<void> {
  const cacheKey = getCacheKey(subscription)

  // Check if we already have this query result cached
  let cacheEntry = queryCache.get(cacheKey)

  if (!cacheEntry) {
    try {
      // Create Sanity client for this project/dataset
      const client = createClient({
        projectId: subscription.projectId,
        dataset: subscription.dataset,
        apiVersion: '2024-01-01',
        useCdn: true,
      })

      // Execute the query
      console.log('[SharedWorker] Executing query:', subscription.params?.['query'])
      const result = await client.fetch(
        subscription.params?.['query'] as string,
        (subscription.params?.['options'] as Record<string, unknown>) || {},
      )

      // Cache the result
      cacheEntry = {
        result,
        timestamp: Date.now(),
        subscribers: new Set(),
      }
      queryCache.set(cacheKey, cacheEntry)

      console.log('[SharedWorker] Query executed and cached:', cacheKey)
    } catch (error) {
      console.error('[SharedWorker] Query execution failed:', error)
      port.postMessage({
        type: 'SUBSCRIPTION_ERROR',
        data: {
          error: `Query execution failed: ${(error as Error).message}`,
          subscriptionId: subscription.subscriptionId,
        },
      })
      return
    }
  }

  // Add this port as a subscriber to the cache entry
  cacheEntry.subscribers.add(port)

  // Send the query result back to the subscriber
  port.postMessage({
    type: 'SUBSCRIPTION_REGISTERED',
    data: {
      subscriptionId: subscription.subscriptionId,
      result: cacheEntry.result,
      cached: cacheEntry.timestamp !== Date.now(),
      cacheKey,
    },
  })

  console.log('[SharedWorker] Query result sent to subscriber:', subscription.subscriptionId)
}

/**
 * @internal
 * Handle the unregistration of a subscription
 * @param subscriptionId - The ID of the subscription to unregister
 * @param port - The port to send the response to
 */
function handleUnregisterSubscription(subscriptionId: string, port: MessagePort): void {
  try {
    sharedWorkerStore.getState().unregisterSubscription(subscriptionId)

    // Send confirmation back to the client
    port.postMessage({
      type: 'SUBSCRIPTION_UNREGISTERED',
      data: {subscriptionId},
    })

    console.log('[SharedWorker] Unregistered subscription:', subscriptionId)
  } catch (error) {
    console.error('[SharedWorker] Failed to unregister subscription:', error)

    // Send error back to the client
    port.postMessage({
      type: 'SUBSCRIPTION_ERROR',
      data: {error: (error as Error).message, subscriptionId},
    })
  }
}

function handleGetSubscriptionCount(port: MessagePort): void {
  try {
    const count = sharedWorkerStore.getState().getSubscriptionCount()

    port.postMessage({
      type: 'SUBSCRIPTION_COUNT',
      data: {count},
    })
  } catch (error) {
    console.error('[SharedWorker] Failed to get subscription count:', error)

    port.postMessage({
      type: 'SUBSCRIPTION_ERROR',
      data: {error: (error as Error).message},
    })
  }
}

function handleGetAllSubscriptions(port: MessagePort): void {
  try {
    const subscriptions = sharedWorkerStore.getState().getAllSubscriptions()

    port.postMessage({
      type: 'ALL_SUBSCRIPTIONS',
      data: {subscriptions},
    })
  } catch (error) {
    console.error('[SharedWorker] Failed to get all subscriptions:', error)

    port.postMessage({
      type: 'SUBSCRIPTION_ERROR',
      data: {error: (error as Error).message},
    })
  }
}

// Export for testing/development (this won't be used in the actual SharedWorker)
/** @internal */
export {handleRegisterSubscription, handleUnregisterSubscription}
