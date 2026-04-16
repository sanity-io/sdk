import {type SanityInstance} from '@sanity/sdk'
import {trackHookMounted} from '@sanity/sdk/_internal'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Tracks the first usage of a named hook per SDK session.
 * If the telemetry manager hasn't initialized yet, the hook
 * name is buffered and flushed when it becomes available.
 *
 * Call at the top of any public hook whose adoption we want to measure.
 *
 * @internal
 */
export function useTrackHookUsage(hookName: string): void {
  const instance = useSanityInstance()
  trackHookMounted(instance, hookName)
}

/**
 * Non-hook variant for tracking hook usage when an instance is already
 * available (avoids an extra `useSanityInstance` call in hooks that
 * already have the instance).
 *
 * @internal
 */
export function trackHookUsage(instance: SanityInstance, hookName: string): void {
  trackHookMounted(instance, hookName)
}
