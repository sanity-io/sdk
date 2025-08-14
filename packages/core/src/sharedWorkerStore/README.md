# SharedWorker Store

> **@internal** - This is an internal implementation for the SharedWorker integration POC.

## Overview

The SharedWorker store provides a centralized subscription management system for SDK apps running within the Dashboard iframe environment. It acts as a "meta-store" that tracks active subscriptions across multiple apps and can coordinate data updates.

## Architecture

### Core Components

- **`sharedWorkerStore`**: Zustand-based store that manages subscription state
- **`SubscriptionRequest`**: Interface for subscription registration requests
- **`ActiveSubscription`**: Represents an active subscription with metadata
- **Utility functions**: Helper functions for subscription management

### State Structure

The store maintains a single data structure:

1. **`subscriptions`**: Map of subscription ID to subscription details

### Key Features

- **Subscription Registration**: Add new subscriptions with metadata
- **Subscription Cleanup**: Remove subscriptions when apps disconnect
- **Simple Lookups**: Fast subscription queries by ID
- **Duplicate Detection**: Utilities to identify equivalent subscriptions

## Usage

### Basic Subscription Management

```typescript
import {sharedWorkerStore, createSubscriptionRequest} from '@sanity/sdk'

// Register a query subscription
const subscription = createSubscriptionRequest({
  storeName: 'query',
  projectId: 'my-project',
  dataset: 'production',
  params: ['*[_type == "movie"]', {}],
})

sharedWorkerStore.getState().registerSubscription(subscription)

// Later, unregister
sharedWorkerStore.getState().unregisterSubscription(subscription.subscriptionId)
```

### Querying Subscriptions

```typescript
// Get all active subscriptions
const allSubs = sharedWorkerStore.getState().getAllSubscriptions()

// Check if a subscription exists
const exists = sharedWorkerStore.getState().hasSubscription(subscriptionId)

// Get total count
const count = sharedWorkerStore.getState().getSubscriptionCount()
```

### Utility Functions

```typescript
import {
  areSubscriptionsEquivalent,
  groupSubscriptionsByParams,
  findDuplicateSubscriptions,
} from '@sanity/sdk'

// Check if two subscriptions are equivalent
const equivalent = areSubscriptionsEquivalent(sub1, sub2)

// Group subscriptions by their parameters
const groups = groupSubscriptionsByParams(subscriptions)

// Find duplicate subscriptions that could be consolidated
const duplicates = findDuplicateSubscriptions(subscriptions)
```

## Design Decisions

### Why Zustand?

- **Lightweight**: Minimal bundle size impact
- **Familiar**: Consistent with existing store patterns in the SDK
- **Flexible**: Easy to extend with new actions and state

### Subscription Management

Simple subscription tracking focused on individual subscription lifecycle:

- **By ID**: Fast individual subscription access
- **Minimal State**: Single map for all subscriptions
- **Clean Operations**: Register, unregister, check existence

### Immutable Updates

All state updates create new Map/Set instances to ensure proper reactivity and avoid mutation issues.

## Future Enhancements

This is a POC implementation. Future versions may include:

- **Data Caching**: Store actual query results in the SharedWorker
- **Update Broadcasting**: Push data updates to subscribed apps
- **Connection Management**: Handle app disconnections and reconnections
- **Performance Metrics**: Track subscription patterns and optimize accordingly

## Integration Points

The SharedWorker store is designed to integrate with:

1. **Existing SDK Stores**: Query, document, and other stores can register subscriptions
2. **Comlink System**: Use existing cross-app communication infrastructure
3. **Dashboard Environment**: Detect when running in Dashboard iframe context
4. **Fallback Behavior**: Gracefully degrade when SharedWorker is unavailable
