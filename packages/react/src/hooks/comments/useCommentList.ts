import {type DocumentResource, type SanityInstance, type StateSource} from '@sanity/sdk'
import {useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
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
  const [isPending, startTransition] = useTransition()

  const key = getKey(normalized)
  // Held one render behind `key`, so the swap can happen inside a transition.
  const [deferredKey, setDeferredKey] = useState(key)
  const abortRef = useRef<AbortController>(new AbortController())

  useEffect(() => {
    if (key === deferredKey) return

    startTransition(() => {
      if (!abortRef.current.signal.aborted) {
        abortRef.current.abort()
        abortRef.current = new AbortController()
      }
      setDeferredKey(key)
    })
  }, [deferredKey, key])

  const deferred = useMemo(() => parseKey(deferredKey), [deferredKey, parseKey])
  const {getCurrent, subscribe} = useMemo(
    () => getState(instance, deferred),
    [deferred, getState, instance],
  )

  if (getCurrent() === undefined) {
    // Reading the ref mid-render is safe here: React runs no effects for a
    // render that suspends, so the signal captured now cannot be swapped
    // underneath this pass.
    const currentSignal = abortRef.current.signal

    // eslint-disable-next-line react-hooks/refs -- intentional during a suspended render; see above
    throw resolve(instance, {...deferred, signal: currentSignal})
  }

  // Not memoised: every caller destructures this immediately and memoises its
  // own result object, so a stable identity here would never be observed.
  return {value: useSyncExternalStore(subscribe, getCurrent) as TValue, isPending}
}
