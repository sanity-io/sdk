/* eslint-disable no-console */
/**
 * @internal
 * Client utility for Dashboard to register and communicate with the SharedWorker
 */

import {type SubscriptionRequest} from './types'

// const workerInstance: SharedWorker | null = null
const messageHandlers = new Map<string, (data: unknown) => void>()
let registration: ServiceWorkerRegistration | null = null

/**
 * @internal
 * Register the SharedWorker client
 * @param scriptPath - Path to the SharedWorker script
 * @param options - Registration options
 */
export async function registerSharedWorkerClient(
  scriptPath: string,
  options?: RegistrationOptions,
): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('SharedWorker not supported in this browser')
  }

  try {
    registration = await navigator.serviceWorker.register(scriptPath, options)

    // Wait for the SharedWorker to be ready
    await navigator.serviceWorker.ready

    // Set up message handling
    navigator.serviceWorker.addEventListener('message', handleMessage)

    console.log('[SharedWorkerClient] SharedWorker registered successfully')
  } catch (error) {
    console.error('[SharedWorkerClient] Failed to register SharedWorker:', error)
    throw error
  }
}

/**
 * @internal
 * Unregister the SharedWorker
 */
export async function unregister(): Promise<void> {
  if (registration) {
    await registration.unregister()
    registration = null
    console.log('[SharedWorkerClient] SharedWorker unregistered')
  }
}

/**
 * @internal
 * Register a subscription with the SharedWorker
 * @param subscription - Subscription to register
 * @returns Promise that resolves when subscription is confirmed
 */
export async function registerSubscription(subscription: SubscriptionRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const messageId = `register_${Date.now()}`

    // Set up one-time handler for the response
    messageHandlers.set(messageId, (data: unknown) => {
      const response = data as {type: string; data: {subscriptionId: string; error?: string}}
      if (response.type === 'SUBSCRIPTION_REGISTERED') {
        messageHandlers.delete(messageId)
        resolve(response.data.subscriptionId)
      } else if (response.type === 'SUBSCRIPTION_ERROR') {
        messageHandlers.delete(messageId)
        reject(new Error(response.data.error))
      }
    })

    // Send message to SharedWorker
    sendMessage({
      type: 'REGISTER_SUBSCRIPTION',
      data: subscription,
    })
  })
}

/**
 * @internal
 * Unregister a subscription with the SharedWorker
 * @param subscriptionId - ID of subscription to unregister
 * @returns Promise that resolves when unregistration is confirmed
 */
export async function unregisterSubscription(subscriptionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const messageId = `unregister_${Date.now()}`

    // Set up one-time handler for the response
    messageHandlers.set(messageId, (data: unknown) => {
      const response = data as {type: string; data: {error?: string}}
      if (response.type === 'SUBSCRIPTION_UNREGISTERED') {
        messageHandlers.delete(messageId)
        resolve()
      } else if (response.type === 'SUBSCRIPTION_ERROR') {
        messageHandlers.delete(messageId)
        reject(new Error(response.data.error))
      }
    })

    // Send message to SharedWorker
    sendMessage({
      type: 'UNREGISTER_SUBSCRIPTION',
      data: {subscriptionId},
    })
  })
}

/**
 * Send a message to the SharedWorker
 * (should be private, we only communicate with the SharedWorker via helper functions)
 * @param message - Message to send
 */
function sendMessage(message: unknown): void {
  if (!registration?.active) {
    throw new Error('SharedWorker not active')
  }

  registration.active.postMessage(message)
}

/**
 * Handle messages from the SharedWorker
 * @param event - Message event
 */
function handleMessage(event: MessageEvent): void {
  const {type, data} = event.data

  // Route messages to appropriate handlers
  if (
    type === 'SUBSCRIPTION_REGISTERED' ||
    type === 'SUBSCRIPTION_UNREGISTERED' ||
    type === 'SUBSCRIPTION_ERROR'
  ) {
    // Find the appropriate handler based on message type
    for (const [messageId, handler] of messageHandlers.entries()) {
      if (messageId.includes(type.toLowerCase().split('_')[0])) {
        handler({type, data})
        break
      }
    }
  }
}
