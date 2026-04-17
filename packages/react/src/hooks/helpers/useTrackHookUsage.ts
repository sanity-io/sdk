import {type SanityInstance} from '@sanity/sdk'
import {trackHookMounted} from '@sanity/sdk/_internal'
import {useRef} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Tracks the first usage of a named hook per SDK session.
 * If the telemetry manager hasn't initialized yet, the hook
 * name is buffered and flushed when it becomes available.
 *
 * Uses a ref to ensure the tracking call only happens once per
 * component mount, avoiding repeated WeakMap lookups on re-renders.
 *
 * Call at the top of any public hook whose adoption we want to measure.
 *
 * @internal
 */
export function useTrackHookUsage(hookName: string): void {
  const instance = useSanityInstance()
  const tracked = useRef(false)
  if (!tracked.current) {
    tracked.current = true
    trackHookMounted(instance, hookName)
  }
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
