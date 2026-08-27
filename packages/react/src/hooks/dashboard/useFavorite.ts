import {favorites} from '@sanity/sdk'

import {createFetcherHook} from '../helpers/createFetcherHook'
import {useFavoriteContext, type UseFavoriteProps} from './useFavoriteContext'

const useFavoriteStatus = createFetcherHook(favorites)

/**
 * @internal
 *
 * Reads whether a document is currently favorited. The write-side counterpart is
 * {@link useUpdateFavorite}.
 *
 * The hook suspends until the first favorite status resolves, so wrap the
 * component in a `<Suspense>` boundary.
 *
 * @param props - The document handle plus the resource it lives in.
 * @returns `true` when the document is favorited, otherwise `false`.
 *
 * @example
 * ```tsx
 * function FavoriteLabel(props: DocumentActionProps) {
 *   const {documentId, documentType} = props
 *   const isFavorited = useFavorite({documentId, documentType, resourceType: 'studio'})
 *
 *   return <span>{isFavorited ? 'Favorited' : 'Not favorited'}</span>
 * }
 * ```
 */
export function useFavorite(props: UseFavoriteProps): boolean {
  const context = useFavoriteContext(props)
  const {data} = useFavoriteStatus(context)
  return data.isFavorited
}
