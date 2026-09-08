import {type DocumentResource, type SanityInstance, type StateSource} from '@sanity/sdk'
import {useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useDeferredRequestKey} from '../helpers/useDeferredRequestKey'
import {
  useNormalizedResourceOptions,
  type WithResourceNameSupport,
} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * The core functions backing one read hook, plus the option-key pair that keeps
 * its state source steady across renders.
 *
 * @internal
 */
export interface CommentListSource<TOptions, TValue> {
  getState: (instance: SanityInstance, options: TOptions) => StateSource<TValue | undefined>
  resolve: (instance: SanityInstance, options: TOptions & {signal?: AbortSignal}) => Promise<TValue>
  getKey: (options: TOptions) => string
  parseKey: (key: string) => TOptions
}

/**
 * Shared body of the comment read hooks.
 *
 * Suspends until the first snapshot arrives. Changing documents or filters
 * happens in a transition, so the list already on screen stays put and
 * `isPending` reports the swap instead of the component suspending again. The
 * previous read is aborted, which drops its listener when nothing else is
 * reading it.
 *
 * @internal
 */
export function useCommentList<TOptions extends {resource?: DocumentResource}, TValue>(
  hookName: string,
  options: WithResourceNameSupport<TOptions>,
  {getState, resolve, getKey, parseKey}: CommentListSource<TOptions, TValue>,
): {value: TValue; isPending: boolean} {
  const instance = useSanityInstance()
  trackHookUsage(instance, hookName)

  const normalized = useNormalizedResourceOptions(options) as TOptions

  const {deferredKey, signal, isPending} = useDeferredRequestKey(getKey(normalized))

  const deferred = useMemo(() => parseKey(deferredKey), [deferredKey, parseKey])
  const {getCurrent, subscribe} = useMemo(
    () => getState(instance, deferred),
    [deferred, getState, instance],
  )

  if (getCurrent() === undefined) {
    throw resolve(instance, {...deferred, signal})
  }

  // Not memoised: every caller destructures this immediately and memoises its
  // own result object, so a stable identity here would never be observed.
  return {value: useSyncExternalStore(subscribe, getCurrent) as TValue, isPending}
}
