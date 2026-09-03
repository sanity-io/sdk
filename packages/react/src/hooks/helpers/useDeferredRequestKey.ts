import {useEffect, useState, useTransition} from 'react'

/**
 * @internal
 */
export interface DeferredRequestKey {
  /**
   * The key to read and resolve against. Lags `key` by one transition.
   */
  deferredKey: string
  /**
   * Aborts as soon as `key` moves on, so a suspending read for options the
   * caller has already replaced doesn't stay in flight.
   */
  signal: AbortSignal
  /**
   * Whether the transition to a newer key is still running.
   */
  isPending: boolean
}

/**
 * Holds a request key one transition behind the caller's own, so a component
 * whose options change keeps rendering its previous data instead of falling
 * back to a Suspense boundary.
 *
 * @internal
 */
export function useDeferredRequestKey(key: string): DeferredRequestKey {
  const [isPending, startTransition] = useTransition()
  const [deferredKey, setDeferredKey] = useState(key)
  const [controller, setController] = useState<AbortController>(new AbortController())

  useEffect(() => {
    if (key === deferredKey) return

    startTransition(() => {
      if (!controller.signal.aborted) {
        controller.abort()
        setController(new AbortController())
      }

      setDeferredKey(key)
    })
  }, [controller, deferredKey, key])

  return {deferredKey, signal: controller.signal, isPending}
}
