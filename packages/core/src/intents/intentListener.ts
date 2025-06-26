import {type SanityInstance} from '../store/createSanityInstance'
import {checkAndHandleCurrentIntent, type IntentHandlingOptions} from './intentHandling'

/**
 * Global registry to track active intent listeners
 * -- could be a store maybe?
 * @internal
 */
const activeListeners = new Map<string, () => void>()

/**
 * Starts listening for intent URLs and automatically handles them.
 *
 * @param instance - The Sanity instance with intent handlers
 * @param options - Configuration options for intent handling
 * @returns Cleanup function to stop listening
 * @internal
 */
export function startIntentListener(
  instance: SanityInstance,
  options: IntentHandlingOptions = {},
): () => void {
  // Don't start if no intent handlers are defined
  if (!instance.config.intentHandlers) {
    return () => {} // No-op cleanup
  }

  // Don't start if we're not in a browser environment
  if (typeof window === 'undefined') {
    return () => {} // No-op cleanup
  }

  const handleNavigation = () => {
    checkAndHandleCurrentIntent(instance, options).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error handling intent during navigation:', error)
    })
  }

  // Check current URL immediately
  handleNavigation()

  // Listen to all navigation events
  window.addEventListener('popstate', handleNavigation)
  window.addEventListener('hashchange', handleNavigation)

  // this is pretty rudimentary -- check studio for better implementation
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  const interceptPushState = (...args: Parameters<typeof history.pushState>) => {
    originalPushState.apply(history, args)
    // Check for intents after navigation
    setTimeout(handleNavigation, 0)
  }

  const interceptReplaceState = (...args: Parameters<typeof history.replaceState>) => {
    originalReplaceState.apply(history, args)
    // Check for intents after navigation
    setTimeout(handleNavigation, 0)
  }

  history.pushState = interceptPushState
  history.replaceState = interceptReplaceState

  // Cleanup function
  const cleanup = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', handleNavigation)
      window.removeEventListener('hashchange', handleNavigation)
    }

    if (typeof history !== 'undefined') {
      // Restore original history methods
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
    }

    // Remove from active listeners
    activeListeners.delete(instance.instanceId)
  }

  // Track this listener
  activeListeners.set(instance.instanceId, cleanup)

  return cleanup
}

/**
 * Stops intent listening for a specific instance
 * @param instance - The Sanity instance to stop listening for
 * @internal
 */
export function stopIntentListener(instance: SanityInstance): void {
  const cleanup = activeListeners.get(instance.instanceId)
  if (cleanup) {
    cleanup()
  }
}

/**
 * Stops all active intent listeners
 * @internal
 */
export function stopAllIntentListeners(): void {
  for (const cleanup of activeListeners.values()) {
    cleanup()
  }
  activeListeners.clear()
}
