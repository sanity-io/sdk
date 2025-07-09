# Presence Feature Implementation Guide

## Overview

This document outlines the implementation of real-time presence functionality in the Sanity SDK. The feature includes:

1. **Presence Store** (`packages/core/src/presence/presenceStore.ts`)
2. **usePresence Hook** (`packages/react/src/hooks/presence/usePresence.ts`)

## Development Setup

1. Run the development server: `pnpm dev`
2. Navigate to the presence route: `http://localhost:5173/presence`
3. The current implementation shows placeholder behavior

## Part 1: Core Presence Store

### Location: `packages/core/src/presence/presenceStore.ts`

### Overview

The presence store manages real-time presence information across users in a Sanity project. It tracks where users are currently active (e.g., which documents they're editing) and broadcasts this information to other connected users.

### Implementation Requirements

1. **Store Initialization**: Set up the presence store with proper state management
2. **Real-time Transport**: Integrate with the existing transport layer for WebSocket communication
3. **Event Handling**: Process incoming presence events (`state`, `disconnect`, `rollCall`)
4. **Session Management**: Track presence by unique session IDs
5. **Outgoing Presence**: Subscribe to local presence updates and broadcast them

### Technical Details

#### Store State Structure

```typescript
export type PresenceStoreState = {
  locations: Map<string, PresenceLocation[]> // sessionId -> locations
  reportPresence$: Subject<PresenceLocation[]> // For outgoing presence updates
}
```

#### Core Functionality

1. **Store Initialization**:

   - Generate unique session identifier
   - Create authenticated Sanity client (API version `2022-06-30`)
   - Set up transport layer for real-time communication
   - Subscribe to incoming transport events
   - Subscribe to outgoing presence updates from `reportPresence$`
   - Send initial presence announcement
   - Return cleanup function for proper resource management

2. **Event Processing**:

   - `state` events: Update the locations map with new presence data
   - `disconnect` events: Remove session from locations map
   - Use `state.set()` with descriptive action names for debugging

3. **Outgoing Presence Management**:
   - Subscribe to `reportPresence$` Subject
   - Implement deduplication to prevent unnecessary updates
   - Send `state` messages via transport dispatch

#### Available Resources

- `createBifurTransport(options)` - Creates real-time transport (see bifurTransport.ts)
- `getTokenState(instance)` - Gets authentication token observable
- `getClient(instance, config)` - Creates Sanity client
- `createSelector` - For memoized selectors
- `bindActionByDataset` / `createStateSourceAction` - Store binding patterns

### Testing

The presence route at `/presence` should:

1. Display current presence locations from all users
2. Send presence updates every second for a test document
3. Show real-time updates when multiple users are active

## Part 2: React Integration Hook

### Location: `packages/react/src/hooks/presence/usePresence.ts`

### Overview

The `usePresence` hook provides React components with real-time presence information and the ability to report their own presence. It integrates with the presence store to manage subscriptions and updates.

### Implementation Requirements

1. **State Subscription**: Use React's concurrent-safe external store subscription
2. **Presence Source**: Integrate with the core presence store
3. **Presence Reporting**: Provide function to report current user's presence
4. **Performance**: Implement proper React optimization patterns

### Technical Details

#### React Integration Patterns

- `useSyncExternalStore` for external state subscription
- `useCallback` for stable function references
- `useMemo` for expensive computations
- `useSanityInstance` for SDK context

#### Expected Behavior

1. **Subscription Setup**: Create a subscription to presence locations
2. **State Synchronization**: Use `useSyncExternalStore` with proper subscribe/getSnapshot functions
3. **Presence Reporting**: Provide a callback function to update presence
4. **Performance**: Optimize with proper dependency arrays

#### Available Resources

- `getPresenceLocations(sanityInstance)` - Returns StateSource for presence data
- `reportPresence(sanityInstance, locations)` - Sends presence updates
- `useSanityInstance()` - Gets SDK instance from React context
- `useSyncExternalStore` - React hook for external state subscriptions
- `useCallback`/`useMemo` - For performance optimization

### Testing

Test with the presence route at `/presence`:

- Should display current presence locations from all users
- Should send presence updates every second for a test document
- Should show real-time updates when multiple users are active

## Architecture Notes

### StateSource Pattern

StateSource provides reactive access to data with:

- `getCurrent()`: Get current value
- `subscribe(callback)`: Subscribe to updates
- Automatic cleanup and memory management

### Bifur Transport Layer

Real-time communication layer that:

- Handles WebSocket connections
- Manages authentication tokens
- Provides event-based messaging

### React Concurrent Features

The hook integrates with React's concurrent features:

- Uses `useSyncExternalStore` for tearing-safe subscriptions
- Supports Suspense and concurrent rendering
- Integrates with React's scheduling priorities

## Implementation Checklist

- [ ] Core presence store initialization
- [ ] Transport layer integration
- [ ] Event handling (state, disconnect, rollCall)
- [ ] Session management
- [ ] Outgoing presence subscription
- [ ] React hook implementation
- [ ] Performance optimizations
- [ ] Error handling
- [ ] Cleanup and resource management
- [ ] Integration testing

## References

- Check existing similar implementations in the codebase
- Look at test files for expected behavior patterns
- Use TypeScript for type safety and development experience
- Console logs can help debug real-time behavior

## Questions & Discussion

For implementation questions or architectural discussions:

- Review existing store patterns in the codebase
- Consider edge cases and error scenarios
- Evaluate performance implications
- Test with multiple concurrent users
