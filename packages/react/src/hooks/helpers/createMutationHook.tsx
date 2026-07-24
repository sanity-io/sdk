import {type SanityInstance} from '@sanity/sdk'
import {type MutationResult} from '@sanity/sdk/_internal'
import {useCallback, useRef, useState} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * The value returned by a mutation-backed hook. The write-side counterpart to
 * {@link FetcherHookResult}: local `{mutate, isPending, error, data, reset}`
 * state around a core mutation action.
 *
 * @public
 */
export interface MutationHookResult<TInput, TResult> {
  /**
   * Runs the mutation. Resolves with the server response; rejects on failure
   * (the failure is also captured in {@link MutationHookResult.error}, so a
   * fire-and-forget caller should read `error` and an `await`ing caller should
   * `try`/`catch`).
   */
  mutate: (input: TInput) => Promise<TResult>
  /** A mutation is currently in flight. */
  isPending: boolean
  /** The most recent failure; cleared by the next `mutate` or `reset`. */
  error: unknown
  /** The last successful server response, or `undefined` before the first success. */
  data: TResult | undefined
  /** Clears state back to idle and abandons any in-flight result. */
  reset: () => void
}

type MutationState<TResult> =
  | {status: 'idle'; data: undefined; error: undefined}
  | {status: 'pending'; data: TResult | undefined; error: undefined}
  | {status: 'success'; data: TResult; error: undefined}
  | {status: 'error'; data: TResult | undefined; error: unknown}

/**
 * Builds a hook over a core mutation action (the result of `defineMutation`).
 * The write-side counterpart to {@link createFetcherHook}: it binds the action
 * to the current {@link SanityInstance} and tracks `{isPending, error, data}`
 * locally. `mutate` resolves with the server response only — the mutation's
 * `invalidated` promise is intentionally not exposed, since cache
 * reconciliation is handled by the fetcher stores.
 *
 * @internal
 */
export function createMutationHook<TInput, TResult>(
  mutation: (instance: SanityInstance, input: TInput) => Promise<MutationResult<TResult>>,
): () => MutationHookResult<TInput, TResult> {
  const idle: MutationState<TResult> = {status: 'idle', data: undefined, error: undefined}

  return function useMutationHook(): MutationHookResult<TInput, TResult> {
    const instance = useSanityInstance()
    const [state, setState] = useState<MutationState<TResult>>(idle)
    // Increments per call; only the latest call is allowed to write state, so an
    // earlier in-flight mutation can't clobber a later one (or a `reset`).
    const callId = useRef(0)

    const mutate = useCallback(
      (input: TInput): Promise<TResult> => {
        const id = ++callId.current
        setState((prev) => ({status: 'pending', data: prev.data, error: undefined}))
        return mutation(instance, input).then(
          ({data}) => {
            if (id === callId.current) setState({status: 'success', data, error: undefined})
            return data
          },
          (error: unknown) => {
            if (id === callId.current) {
              setState((prev) => ({status: 'error', data: prev.data, error}))
            }
            throw error
          },
        )
      },
      [instance],
    )

    const reset = useCallback(() => {
      callId.current++ // abandon any in-flight response so it can't revive stale state
      setState(idle)
    }, [])

    return {
      mutate,
      isPending: state.status === 'pending',
      error: state.error,
      data: state.data,
      reset,
    }
  }
}
