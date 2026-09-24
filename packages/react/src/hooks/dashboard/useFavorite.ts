/* eslint-disable react-compiler/react-compiler -- the transport branch in `useFavorite` is a deliberate rules-of-hooks exception; the compiler refuses files that disable it */
import {favorites} from '@sanity/sdk'
import {isDashboardEnvironment} from '@sanity/sdk/_internal'
import {type FavoriteDocument} from '@sanity/sdk/dashboard'

import {createFetcherHook} from '../helpers/createFetcherHook'
import {toFavoriteDocument, useFavoriteContext, type UseFavoriteProps} from './useFavoriteContext'
import {useTopic} from './useTopic'

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
  // The branch is stable: the transport is fixed for the page lifetime, so one set of hooks
  // always runs and the other never does.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  if (isDashboardEnvironment()) return useBusFavorite(props)
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  return useComlinkFavorite(props)
}

function useComlinkFavorite(props: UseFavoriteProps): boolean {
  const context = useFavoriteContext(props)
  const {data} = useFavoriteStatus(context)
  return data.isFavorited
}

const isSameFavorite = (a: FavoriteDocument, b: FavoriteDocument): boolean =>
  a.id === b.id &&
  a.resource.id === b.resource.id &&
  a.resource.type === b.resource.type &&
  a.resource.schemaName === b.resource.schemaName

function useBusFavorite(props: UseFavoriteProps): boolean {
  const target = toFavoriteDocument(useFavoriteContext(props))
  const documents = useTopic('favorites.documents')
  return documents?.some((document) => isSameFavorite(document, target)) ?? false
}
