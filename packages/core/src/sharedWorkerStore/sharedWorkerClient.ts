/* eslint-disable no-console */
/**
 * @internal
 * Client utility for Dashboard to register and communicate with the SharedWorker
 */

import {type SubscriptionRequest} from './types'

type SendMessage = (type: string, payload: unknown) => Promise<{type: string; data: unknown}>

// Worker status types
/** @internal */
export type WorkerStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

// Message buffer for when worker is not yet connected
const messageBuffer: Array<{type: string; data: unknown; messageId: string}> = []

// Worker instance and status
let workerInstance: SharedWorker | null = null
let workerStatus: WorkerStatus = 'disconnected'
const messageHandlers = new Map<string, (response: {type: string; data: unknown}) => void>()

// Event listeners for status changes
const statusListeners = new Set<(status: WorkerStatus) => void>()

// Function to update worker status and notify listeners
function updateWorkerStatus(status: WorkerStatus) {
  workerStatus = status
  statusListeners.forEach((listener) => listener(status))
}

/**
 * @internal
 * Function to register status change listeners
 */
export function addStatusListener(listener: (status: WorkerStatus) => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

/**
 * @internal
 * Get or create the SDK worker instance
 */
export function getSdkWorker(workerUrl: string): {status: WorkerStatus; sendMessage: SendMessage} {
  console.log('[SharedWorkerClient] getSdkWorker called with URL:', workerUrl)

  if (workerInstance) {
    console.log('[SharedWorkerClient] Worker instance already exists')
    return {
      status: workerStatus,
      sendMessage,
    }
  }

  // Set status to connecting before creating the worker
  updateWorkerStatus('connecting')

  try {
    const worker = new SharedWorker(workerUrl, {
      type: 'module',
    })
    console.log('[SharedWorkerClient] SharedWorker created successfully')

    workerInstance = worker

    // Set up port message handling
    worker.port.onmessage = (event) => {
      console.log('[SharedWorkerClient] Received message from worker:', event.data)
      const response = event.data

      // Handle connection status message
      if (response.type === 'welcome') {
        console.log('[SharedWorkerClient] Received welcome message')
        updateWorkerStatus('connected')
        // Process any buffered messages
        processBufferedMessages()
        return
      }

      // Handle regular messages - find the handler by checking all handlers
      for (const [messageId, handler] of messageHandlers.entries()) {
        // Check if this response matches the expected response type for this message
        if (isResponseForMessage(response, messageId)) {
          handler(response)
          messageHandlers.delete(messageId)
          break
        }
      }
    }

    // Start the port
    worker.port.start()

    // Handle worker connection errors
    worker.port.onmessageerror = (error) => {
      console.error('[SharedWorkerClient] Port message error:', error)
      updateWorkerStatus('error')
    }

    // Handle worker errors
    worker.onerror = (error) => {
      console.error('[SharedWorkerClient] Worker error:', error)
      updateWorkerStatus('error')
    }
  } catch (error) {
    console.error('[SharedWorkerClient] Failed to create worker:', error)
    updateWorkerStatus('error')
  }

  console.log('[SharedWorkerClient] getSdkWorker returning with status:', workerStatus)
  return {
    status: workerStatus,
    sendMessage,
  }
}

// Helper function to determine if a response matches a message
function isResponseForMessage(response: {type: string; data: unknown}, messageId: string): boolean {
  // Extract the message type from the messageId
  // messageId format: "REGISTER_SUBSCRIPTION_timestamp_random"
  const parts = messageId.split('_')
  const messageType = parts.slice(0, -2).join('_') // Remove timestamp and random parts

  // A bit hard-coded. We can pass in configuration later
  const responseMap: Record<string, string[]> = {
    REGISTER_SUBSCRIPTION: ['SUBSCRIPTION_REGISTERED', 'SUBSCRIPTION_ERROR'],
    UNREGISTER_SUBSCRIPTION: ['SUBSCRIPTION_UNREGISTERED', 'SUBSCRIPTION_ERROR'],
    GET_SUBSCRIPTION_COUNT: ['SUBSCRIPTION_COUNT', 'SUBSCRIPTION_ERROR'],
    GET_ALL_SUBSCRIPTIONS: ['ALL_SUBSCRIPTIONS', 'SUBSCRIPTION_ERROR'],
  }

  const expectedResponses = responseMap[messageType] || []
  const result = expectedResponses.includes(response.type)
  return result
}

// Process any buffered messages once connected
function processBufferedMessages() {
  if (workerStatus !== 'connected' || !workerInstance) return

  while (messageBuffer.length > 0) {
    const message = messageBuffer.shift()
    if (message) {
      sendMessageInternal(message)
    }
  }
}

// Internal function to send a message to the worker
function sendMessageInternal(message: {type: string; data: unknown; messageId?: string}): boolean {
  if (!workerInstance || workerStatus !== 'connected') {
    return false
  }

  // Remove messageId from the message sent to worker
  const {messageId: _, ...workerMessage} = message
  workerInstance.port.postMessage(workerMessage)
  return true
}

// Internal function to handle message sending and response
function handleMessage(message: {
  type: string
  data: unknown
}): Promise<{type: string; data: unknown}> {
  const startTime = Date.now()
  const messageId = `${message.type}_${Date.now()}_${Math.random().toString(36).slice(2)}`

  const promise = new Promise<{type: string; data: unknown}>((resolve, reject) => {
    messageHandlers.set(messageId, (response) => {
      const responseTime = Date.now() - startTime
      console.log(`[SharedWorkerClient] Message handled in ${responseTime}ms:`, message.type)
      resolve(response)
    })

    // Set a timeout to reject the promise if no response is received
    setTimeout(() => {
      if (messageHandlers.has(messageId)) {
        messageHandlers.delete(messageId)
        reject(new Error('Message timeout'))
      }
    }, 30000) // 30 second timeout
  })

  // If worker is explicitly disconnected, reject immediately
  if (workerStatus === 'disconnected') {
    return Promise.reject(new Error('Worker explicitly disconnected'))
  }

  // If worker is in error state, reject immediately
  if (workerStatus === 'error') {
    return Promise.reject(new Error('Worker in error state'))
  }

  // If worker is not yet connected, buffer the message
  if (workerStatus !== 'connected') {
    messageBuffer.push({...message, messageId})
    return promise
  }

  // Send message if connected
  const sent = sendMessageInternal({...message, messageId})
  if (!sent) {
    return Promise.reject(new Error('Failed to send message'))
  }

  return promise
}

/**
 * @internal
 * Send a message to the worker
 */
export function sendMessage(
  type: string,
  payload: unknown,
): Promise<{type: string; data: unknown}> {
  const message = {type, data: payload}
  return handleMessage(message)
}

/**
 * @internal
 * Disconnect the worker
 */
export function disconnectWorker(): void {
  if (workerInstance) {
    workerInstance.port.close()
    workerInstance = null
    updateWorkerStatus('disconnected')
    messageBuffer.length = 0 // Clear message buffer
  }
}

/**
 * @internal
 * Register a subscription with the SharedWorker
 * @param subscription - Subscription to register
 * @returns Promise that resolves when subscription is confirmed
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registerSubscription(subscription: SubscriptionRequest): Promise<any> {
  const response = await sendMessage('REGISTER_SUBSCRIPTION', subscription)

  if (response.type === 'SUBSCRIPTION_REGISTERED') {
    // Return the full response data which now includes query results for query subscriptions
    return response.data
  } else if (response.type === 'SUBSCRIPTION_ERROR') {
    throw new Error((response.data as {error: string}).error)
  } else {
    throw new Error(`Unexpected response type: ${response.type}`)
  }
}

/**
 * @internal
 * Unregister a subscription with the SharedWorker
 * @param subscriptionId - ID of subscription to unregister
 * @returns Promise that resolves when unregistration is confirmed
 */
export async function unregisterSubscription(subscriptionId: string): Promise<void> {
  const response = await sendMessage('UNREGISTER_SUBSCRIPTION', {subscriptionId})

  if (response.type === 'SUBSCRIPTION_UNREGISTERED') {
    return
  } else if (response.type === 'SUBSCRIPTION_ERROR') {
    throw new Error((response.data as {error: string}).error)
  } else {
    throw new Error(`Unexpected response type: ${response.type}`)
  }
}
