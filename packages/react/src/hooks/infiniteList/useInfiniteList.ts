import {type DocumentHandle, type QueryOptions} from '@sanity/sdk'
import {type SortOrderingItem} from '@sanity/types'
import {pick} from 'lodash-es'
import {useCallback, useEffect, useMemo, useState} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useQuery} from '../query/useQuery'

const DEFAULT_BATCH_SIZE = 25
const DEFAULT_PERSPECTIVE = 'drafts'

/**
 * Result structure returned from the infinite list query
 * @internal
 */
interface InfiniteListQueryResult {
  count: number
  data: DocumentHandle[]
}

/**
 * Configuration options for the useInfiniteList hook
 *
 * @beta
 * @category Types
 */
export interface InfiniteListOptions extends QueryOptions {
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
 * Return value from the useInfiniteList hook
 *
 * @beta
 * @category Types
 */
export interface InfiniteList {
  /**
   * Array of document handles for the current batch
   */
  data: DocumentHandle[]
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
 * const { data, hasMore, isPending, loadMore, count } = useInfiniteList({
 *   filter: '_type == "post"',
 *   search: searchTerm,
 *   batchSize: 10,
 *   orderings: [{field: '_createdAt', direction: 'desc'}]
 * })
 *
 * return (
 *   <div>
 *     Total documents: {count}
 *     <ol>
 *       {data.map((doc) => (
 *         <li key={doc.documentId}>
 *           <MyDocumentComponent doc={doc} />
 *         </li>
 *       ))}
 *     </ol>
 *     {hasMore && <button onClick={loadMore} disabled={isPending}>
 *       {isPending ? 'Loading...' : 'Load More'}
 *     </button>}
 *   </div>
 * )
 * ```
 */
export function useInfiniteList({
  batchSize = DEFAULT_BATCH_SIZE,
  params,
  search,
  filter,
  orderings,
  ...options
}: InfiniteListOptions): InfiniteList {
  const instance = useSanityInstance(options)
  const perspective = options.perspective ?? DEFAULT_PERSPECTIVE
  const [limit, setLimit] = useState(batchSize)

  // Reset the limit to the current batchSize whenever any query parameters
  // (filter, search, params, orderings) or batchSize changes
  const key = JSON.stringify({filter, search, params, orderings, batchSize})
  useEffect(() => {
    setLimit(batchSize)
  }, [key, batchSize])

  const filterClause = useMemo(() => {
    const conditions: string[] = []

    // Add search query if specified
    if (search?.trim()) {
      conditions.push(`[@] match text::query("${search.trim()}")`)
    }

    // Add additional filter if specified
    if (filter) {
      conditions.push(`(${filter})`)
    }

    return conditions.length ? `[${conditions.join(' && ')}]` : ''
  }, [filter, search])

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

  const dataQuery = `*${filterClause}${orderClause}[0...${limit}]{"documentId":_id,"documentType":_type,...$__dataset}`
  const countQuery = `count(*${filterClause})`

  const {
    data: {count, data},
    isPending,
  } = useQuery<InfiniteListQueryResult>(`{"count":${countQuery},"data":${dataQuery}}`, {
    ...options,
    params: {
      ...params,
      __dataset: pick(instance.config, 'projectId', 'dataset'),
    },
    perspective,
  })

  const hasMore = data.length < count

  const loadMore = useCallback(() => {
    setLimit((prev) => Math.min(prev + batchSize, count))
  }, [count, batchSize])

  return useMemo(
    () => ({data, hasMore, count, isPending, loadMore}),
    [data, hasMore, count, isPending, loadMore],
  )
}
