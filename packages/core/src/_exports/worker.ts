/// <reference lib="webworker" />
/* eslint-disable no-console */

/**
 * @internal
 * SharedWorker for managing subscriptions across SDK apps
 */

import {sharedWorkerStore} from '../sharedWorkerStore/sharedWorkerStore'
import {type SubscriptionRequest} from '../sharedWorkerStore/types'

declare const self: SharedWorkerGlobalScope

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
    sharedWorkerStore.getState().registerSubscription(subscription)

    // Send confirmation back to the client
    port.postMessage({
      type: 'SUBSCRIPTION_REGISTERED',
      data: {subscriptionId: subscription.subscriptionId},
    })

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
