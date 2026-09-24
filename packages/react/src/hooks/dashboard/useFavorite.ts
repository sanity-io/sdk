/* eslint-disable react-compiler/react-compiler -- the transport branch in `useFavorite` is a deliberate rules-of-hooks exception; the compiler refuses files that disable it */
import {favorites, type SanityInstance, type StateSource} from '@sanity/sdk'
import {getTopicState, isDashboardEnvironment, resolveTopic} from '@sanity/sdk/_internal'
import {type FavoriteDocument} from '@sanity/sdk/dashboard'

import {createFetcherHook} from '../helpers/createFetcherHook'
import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {useCapabilities} from './useCapabilities'
import {toFavoriteDocument, useFavoriteContext, type UseFavoriteProps} from './useFavoriteContext'

const useFavoriteStatus = createFetcherHook(favorites)

const NO_FAVORITES: FavoriteDocument[] = []

// A failed read degrades to "not favorited", like the Comlink fetcher.
function getFavoriteDocuments(
  instance: SanityInstance,
): StateSource<FavoriteDocument[] | undefined> {
  const source = getTopicState(instance, 'favorites.documents') as StateSource<
    FavoriteDocument[] | undefined
  >
  const getCurrent = () => {
    try {
      return source.getCurrent()
    } catch {
      return NO_FAVORITES
    }
  }
  return {...source, getCurrent}
}

// Only suspends while the host provides favorites: a host without them never publishes the topic.
const useFavoriteDocuments = createStateSourceHook({
  getState: (instance: SanityInstance, _provided: boolean) => getFavoriteDocuments(instance),
  shouldSuspend: (instance: SanityInstance, provided: boolean) =>
    provided && getFavoriteDocuments(instance).getCurrent() === undefined,
  suspender: (instance: SanityInstance) => resolveTopic(instance, 'favorites.documents'),
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
 * Wrap the component in a `<Suspense>` boundary. A favorite matches on document ID and type
 * and resource ID and type; `schemaName` does not take part, like in Dashboard.
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

// `schemaName` only records which workspace opens the document; Dashboard doesn't match on it.
const isSameFavorite = (a: FavoriteDocument, b: FavoriteDocument): boolean =>
  a.id === b.id &&
  a.type === b.type &&
  a.resource.id === b.resource.id &&
  a.resource.type === b.resource.type

function useBusFavorite(props: UseFavoriteProps): boolean {
  const target = toFavoriteDocument(useFavoriteContext(props))
  const provided = useCapabilities().favorites === true
  const documents = useFavoriteDocuments(provided)
  return provided && (documents?.some((document) => isSameFavorite(document, target)) ?? false)
}
