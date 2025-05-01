import {
  createGroqSearchFilter,
  type DatasetHandle,
  type DocumentHandle,
  type QueryOptions,
} from '@sanity/sdk'
import {type SortOrderingItem} from '@sanity/types'
import {pick} from 'lodash-es'
import {useCallback, useEffect, useMemo, useState} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useQuery} from '../query/useQuery'

const DEFAULT_BATCH_SIZE = 25

/**
 * Configuration options for the useDocuments hook
 *
 * @beta
 * @category Types
 */
export interface DocumentsOptions<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DatasetHandle<TDataset, TProjectId>,
    Pick<QueryOptions, 'perspective' | 'params'> {
  /**
   * Filter documents by their `_type`. Can be a single type or an array of types.
   */
  documentType?: TDocumentType | TDocumentType[]
  /**
   * GROQ filter expression to apply to the query
   */
  filter?: string
  /**
   * Number of items to load per batch (defaults to 25)
   */
  batchSize?: number
  /**
   * Sorting configuration for the results
   */
  orderings?: SortOrderingItem[]
  /**
   * Text search query to filter results
   */
  search?: string
}

/**
 * Return value from the useDocuments hook
 *
 * @beta
 * @category Types
 */
export interface DocumentsResponse<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> {
  /**
   * Array of document handles for the current batch
   */
  data: DocumentHandle<TDocumentType, TDataset, TProjectId>[]
  /**
   * Whether there are more items available to load
   */
  hasMore: boolean
  /**
   * Total count of items matching the query
   */
  count: number
  /**
   * Whether a query is currently in progress
   */
  isPending: boolean
  /**
   * Function to load the next batch of results
   */
  loadMore: () => void
}

/**
 * Retrieves batches of {@link DocumentHandle}s, narrowed by optional filters, text searches, and custom ordering,
 * with infinite scrolling support. The number of document handles returned per batch is customizable,
 * and additional batches can be loaded using the supplied `loadMore` function.
 *
 * @beta
 * @category Documents
 * @param options - Configuration options for the infinite list
 * @returns An object containing the list of document handles, the loading state, the total count of retrieved document handles, and a function to load more
 *
 * @remarks
 * - The returned document handles include projectId and dataset information from the current Sanity instance
 * - This makes them ready to use with document operations and other document hooks
 * - The hook automatically uses the correct Sanity instance based on the projectId and dataset in the options
 *
 * @example Basic infinite list with loading more
 * ```tsx
 * import {
 *   useDocuments,
 *   createDatasetHandle,
 *   type DatasetHandle,
 *   type DocumentHandle,
 *   type SortOrderingItem
 * } from '@sanity/sdk-react'
 * import {Suspense} from 'react'
 *
 * // Define a component to display a single document (using useProjection for efficiency)
 * function MyDocumentComponent({doc}: {doc: DocumentHandle}) {
 *   const {data} = useProjection<{title?: string}>({
 *     ...doc, // Pass the full handle
 *     projection: '{title}'
 *   })
 *
 *   return <>{data?.title || 'Untitled'}</>
 * }
 *
 * // Define props for the list component
 * interface DocumentListProps {
 *   dataset: DatasetHandle
 *   documentType: string
 *   search?: string
 * }
 *
 * function DocumentList({dataset, documentType, search}: DocumentListProps) {
 *   const { data, hasMore, isPending, loadMore, count } = useDocuments({
 *     ...dataset,
 *     documentType,
 *     search,
 *     batchSize: 10,
 *     orderings: [{field: '_createdAt', direction: 'desc'}],
 *   })
 *
 *   return (
 *     <div>
 *       <p>Total documents: {count}</p>
 *       <ol>
 *         {data.map((docHandle) => (
 *           <li key={docHandle.documentId}>
 *            <Suspense fallback="Loading…">
 *              <MyDocumentComponent docHandle={docHandle} />
 *            </Suspense>
 *           </li>
 *         ))}
 *       </ol>
 *       {hasMore && (
 *         <button onClick={loadMore}>
 *           {isPending ? 'Loading...' : 'Load More'}
 *         </button>
 *       )}
 *     </div>
 *   )
 * }
 *
 * // Usage:
 * // const myDatasetHandle = createDatasetHandle({ projectId: 'p1', dataset: 'production' })
 * // <DocumentList dataset={myDatasetHandle} documentType="post" search="Sanity" />
 * ```
 *
 * @example Using `filter` and `params` options for narrowing a collection
 * ```tsx
 * import {useState} from 'react'
 * import {useDocuments} from '@sanity/sdk-react'
 *
 * export default function FilteredAuthors() {
 *   const {max, setMax} = useState(2)
 *   const {data} = useDocuments({
 *     documentType: 'author',
 *     filter: 'length(books) <= $max',
 *     params: {max},
 *   })
 *
 *   return (
 *     <>
 *       <input
 *         id="maxBooks"
 *         type="number"
 *         value={max}
 *         onChange={e => setMax(e.currentTarget.value)}
 *       />
 *       {data.map(author => (
 *         <Suspense key={author.documentId}>
 *           <MyAuthorComponent documentHandle={author} />
 *         </Suspense>
 *       ))}
 *     </>
 *   )
 * }
 * ```
 */
export function useDocuments<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>({
  batchSize = DEFAULT_BATCH_SIZE,
  params,
  search,
  filter,
  orderings,
  documentType,
  ...options
}: DocumentsOptions<TDocumentType, TDataset, TProjectId>): DocumentsResponse<
  TDocumentType,
  TDataset,
  TProjectId
> {
  const instance = useSanityInstance(options)
  const [limit, setLimit] = useState(batchSize)
  const documentTypes = useMemo(
    () =>
      (Array.isArray(documentType) ? documentType : [documentType]).filter(
        (i): i is TDocumentType => typeof i === 'string',
      ),
    [documentType],
  )

  // Reset the limit to the current batchSize whenever any query parameters
  // (filter, search, params, orderings) or batchSize changes
  const key = JSON.stringify({
    filter,
    search,
    params,
    orderings,
    batchSize,
    types: documentTypes,
    ...options,
  })
  useEffect(() => {
    setLimit(batchSize)
  }, [key, batchSize])

  const filterClause = useMemo(() => {
    const conditions: string[] = []
    const trimmedSearch = search?.trim()

    // Add search query filter if specified
    if (trimmedSearch) {
      const searchFilter = createGroqSearchFilter(trimmedSearch)
      if (searchFilter) {
        conditions.push(searchFilter)
      }
    }

    // Add type filter if specified
    if (documentTypes?.length) {
      conditions.push(`(_type in $__types)`)
    }

    // Add additional filter if specified
    if (filter) {
      conditions.push(`(${filter})`)
    }

    return conditions.length ? `[${conditions.join(' && ')}]` : ''
  }, [filter, search, documentTypes])

  const orderClause = orderings
    ? `| order(${orderings
        .map((ordering) =>
          [ordering.field, ordering.direction.toLowerCase()]
            .map((str) => str.trim())
            .filter(Boolean)
            .join(' '),
        )
        .join(',')})`
    : ''

  const dataQuery = `*${filterClause}${orderClause}[0...${limit}]{"documentId":_id,"documentType":_type,...$__handle}`
  const countQuery = `count(*${filterClause})`

  const {
    data: {count, data},
    isPending,
  } = useQuery<{count: number; data: DocumentHandle<TDocumentType, TDataset, TProjectId>[]}>({
    ...options,
    query: `{"count":${countQuery},"data":${dataQuery}}`,
    params: {
      ...params,
      __handle: {
        ...pick(instance.config, 'projectId', 'dataset', 'perspective'),
        ...pick(options, 'projectId', 'dataset', 'perspective'),
      },
      __types: documentTypes,
    },
  })

  // Now use the correctly typed variables
  const hasMore = data.length < count

  const loadMore = useCallback(() => {
    setLimit((prev) => Math.min(prev + batchSize, count))
  }, [count, batchSize])

  return useMemo(
    () => ({data, hasMore, count, isPending, loadMore}),
    [count, data, hasMore, isPending, loadMore],
  )
}
