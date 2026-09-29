/* eslint-disable react-compiler/react-compiler -- the transport branch in `useFavorite` is a deliberate rules-of-hooks exception; the compiler refuses files that disable it */
import {type FavoriteDocumentContext, favorites, type SanityInstance} from '@sanity/sdk'
import {
  getBusFavoriteState,
  isDashboardEnvironment,
  resolveBusFavorite,
} from '@sanity/sdk/_internal'

import {createFetcherHook} from '../helpers/createFetcherHook'
import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {useFavoriteContext, type UseFavoriteProps} from './useFavoriteContext'

const useFavoriteStatus = createFetcherHook(favorites)

const useBusFavoriteStatus = createStateSourceHook({
  getState: getBusFavoriteState,
  shouldSuspend: (instance: SanityInstance, context: FavoriteDocumentContext) =>
    getBusFavoriteState(instance, context).getCurrent() === undefined,
  suspender: resolveBusFavorite,
})

/**
 * @internal
 *
 * Reads whether a document is currently favorited. The write-side counterpart is
 * {@link useUpdateFavorite}.
 *
 * It works in both Dashboard runtimes and picks the transport for the current one:
 *
 * | Runtime | Transport | Suspends until | Returns `false` without throwing when |
 * | --- | --- | --- | --- |
 * | iframe | Comlink | the first status resolves | the status query fails |
 * | federated | message bus | capabilities publish, then `favorites.documents` while the host provides `favorites` | the host does not provide `favorites`, refuses `favorites.documents`, or does not publish it before the query deadline; a later publish shows once the hook renders again, like Comlink's cached status |
 *
 * Dashboard always provides favorites, a message bus host may not. There
 * {@link useUpdateFavorite} rejects, so hide the control unless `useCapabilities().favorites`
 * from `@sanity/sdk-react/dashboard` is `true`.
 *
 * Wrap the component in a `<Suspense>` boundary. A favorite is identified by its published
 * document ID, type, resource and `schemaName` (workspace), like in Dashboard, so draft and
 * version IDs read the favorite of their document.
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

function useBusFavorite(props: UseFavoriteProps): boolean {
  return useBusFavoriteStatus(useFavoriteContext(props)) === true
}
