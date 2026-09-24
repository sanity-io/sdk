/* eslint-disable react-compiler/react-compiler -- the transport branch in `useUpdateFavorite` is a deliberate rules-of-hooks exception; the compiler refuses files that disable it */
import {
  type FavoriteStatusResponse,
  type SanityInstance,
  setFavorite,
  type SetFavoriteInput,
} from '@sanity/sdk'
import {isDashboardEnvironment, requireDashboardMessageBus} from '@sanity/sdk/_internal'
import {useCallback} from 'react'

import {createMutationHook} from '../helpers/createMutationHook'
import {toFavoriteDocument, useFavoriteContext, type UseFavoriteProps} from './useFavoriteContext'

const useSetFavorite = createMutationHook(setFavorite)

// The host keeps `favorites.documents` current, so there is no cache to invalidate.
const useSetBusFavorite = createMutationHook(
  async (instance: SanityInstance, {isFavorited, ...context}: SetFavoriteInput) => {
    await requireDashboardMessageBus(instance, 'update a favorite').emit('favorites.update', {
      document: toFavoriteDocument(context),
      favorited: isFavorited,
    })
    return {data: {isFavorited}, invalidated: Promise.resolve()}
  },
)

/**
 * The value returned by {@link useUpdateFavorite}.
 *
 * @internal
 */
export interface UpdateFavorite {
  /** Adds the document to favorites. */
  favorite: () => Promise<FavoriteStatusResponse>
  /** Removes the document from favorites. */
  unfavorite: () => Promise<FavoriteStatusResponse>
  /** A favorite or unfavorite mutation is currently in flight. */
  isPending: boolean
  /** The most recent failure; cleared by the next call or `reset`. */
  error: unknown
  /** Clears error and pending state back to idle. */
  reset: () => void
}

/**
 * @internal
 *
 * Adds or removes a document from favorites. The read-side counterpart is
 * {@link useFavorite}, which reflects the change once the mutation settles.
 *
 * Unlike {@link useFavorite}, this hook does not suspend. It picks the transport for the current
 * Dashboard runtime:
 *
 * | Runtime | Transport | `favorite`/`unfavorite` resolve | They reject when |
 * | --- | --- | --- | --- |
 * | iframe | Comlink | once Dashboard confirms the write | Dashboard reports a failure |
 * | federated | message bus | once `favorites.documents` reflects the change | no host answers or the host refuses, eg without the `favorites` capability |
 *
 * A rejection also lands in `error`, so catch the returned promise or render `error`.
 *
 * @param props - The document handle plus the resource it lives in.
 * @returns `favorite`/`unfavorite` actions and the `{isPending, error, reset}`
 *   mutation state.
 *
 * @example
 * ```tsx
 * function FavoriteButton(props: DocumentActionProps) {
 *   const {documentId, documentType} = props
 *   const handle = {documentId, documentType, resourceType: 'studio'} as const
 *   const isFavorited = useFavorite(handle)
 *   const {favorite, unfavorite, isPending} = useUpdateFavorite(handle)
 *
 *   return (
 *     <Button
 *       disabled={isPending}
 *       onClick={() => (isFavorited ? unfavorite() : favorite())}
 *       text={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
 *     />
 *   )
 * }
 *
 * // Wrap the component with Suspense since useFavorite suspends
 * function MyDocumentAction(props: DocumentActionProps) {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <FavoriteButton {...props} />
 *     </Suspense>
 *   )
 * }
 * ```
 */
export function useUpdateFavorite(props: UseFavoriteProps): UpdateFavorite {
  // The branch is stable: the transport is fixed for the page lifetime, so one set of hooks
  // always runs and the other never does.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  if (isDashboardEnvironment()) return useFavoriteActions(props, useSetBusFavorite())
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  return useFavoriteActions(props, useSetFavorite())
}

function useFavoriteActions(
  props: UseFavoriteProps,
  {mutate, isPending, error, reset}: ReturnType<typeof useSetFavorite>,
): UpdateFavorite {
  const context = useFavoriteContext(props)

  const favorite = useCallback(() => mutate({...context, isFavorited: true}), [mutate, context])
  const unfavorite = useCallback(() => mutate({...context, isFavorited: false}), [mutate, context])

  return {favorite, unfavorite, isPending, error, reset}
}
