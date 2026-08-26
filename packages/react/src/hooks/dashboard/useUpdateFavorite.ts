import {type FavoriteStatusResponse, setFavorite} from '@sanity/sdk'
import {useCallback} from 'react'

import {createMutationHook} from '../helpers/createMutationHook'
import {useFavoriteContext, type UseFavoriteProps} from './useFavoriteContext'

const useSetFavorite = createMutationHook(setFavorite)

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
 * Unlike {@link useFavorite}, this hook does not suspend.
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
  const context = useFavoriteContext(props)
  const {mutate, isPending, error, reset} = useSetFavorite()

  const favorite = useCallback(() => mutate({...context, isFavorited: true}), [mutate, context])
  const unfavorite = useCallback(() => mutate({...context, isFavorited: false}), [mutate, context])

  return {favorite, unfavorite, isPending, error, reset}
}
