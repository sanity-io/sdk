# SharedWorker Integration Guide

> **@internal** - Guide for integrating the SharedWorker with Dashboard apps

## Overview

This guide explains how to integrate the SharedWorker with your Dashboard app to manage SDK subscriptions.

## Setup in Dashboard App

### 1. Register SharedWorker in Dashboard

In your Dashboard app, register the SharedWorker:

```typescript
import {registerSharedWorkerClient} from '@sanity/sdk'
import {useEffect} from 'react'
import sharedWorkerUrl from '@sanity/sdk/sharedWorker/sharedWorker?serviceWorker&url'

export const DashboardComponent() {
  useEffect(() => {
    const registerSWClient = async () => {
      await registerSharedWorkerClient(serviceWorkerUrl, {
        scope: '/'
      })
    }
    registerSWClient()
  }, [])

  return <div>Dashboard with SharedWorker</div>
}
```

### 2. Use SharedWorker Client

Once registered, you can use the client functions to manage subscriptions:

```typescript
import {registerSubscription, unregisterSubscription, createSubscriptionRequest} from '@sanity/sdk'

// Create a subscription request
const subscription = createSubscriptionRequest({
  storeName: 'query',
  projectId: 'my-project',
  dataset: 'production',
  params: {
    query: '*[_type == "book"]',
    options: {},
  },
  appId: 'dashboard-app', // Required: unique identifier for your app
})

// Register a subscription
const subscriptionId = await registerSubscription(subscription)

// Unregister a subscription
await unregisterSubscription(subscriptionId)
```

## Message Protocol

The SharedWorker communicates using these message types:

### From Dashboard to SharedWorker

- `REGISTER_SUBSCRIPTION` - Register a new subscription
- `UNREGISTER_SUBSCRIPTION` - Remove a subscription

### From SharedWorker to Dashboard

- `SUBSCRIPTION_REGISTERED` - Confirmation of registration
- `SUBSCRIPTION_UNREGISTERED` - Confirmation of unregistration
- `SUBSCRIPTION_ERROR` - Error response

## Error Handling

The SharedWorker client includes built-in error handling:

```typescript
try {
  await registerSubscription(subscription)
} catch (error) {
  if (error.message.includes('SharedWorker not supported')) {
    // Browser doesn't support SharedWorker
    console.log('Falling back to local management')
  } else if (error.message.includes('SharedWorker not active')) {
    // SharedWorker not ready yet
    console.log('SharedWorker not ready, retrying...')
  } else {
    // Other error
    console.error('Subscription failed:', error)
  }
}
```

## Fallback Strategy

When the SharedWorker is unavailable, your app should:

1. **Detect SharedWorker status** by catching registration errors
2. **Implement local subscription management** for fallback
3. **Retry SharedWorker operations** when it becomes available
4. **Sync local state** with SharedWorker when reconnecting

## Next Steps

1. **Test the integration** with your Dashboard app
2. **Implement fallback logic** for when SharedWorker is unavailable
3. **Add subscription forwarding** from iframed SDK apps
4. **Implement data update broadcasting** from SharedWorker to apps
