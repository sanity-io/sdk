import {type DocumentHandle, type QueryOptions} from '@sanity/sdk'
import {type SortOrderingItem} from '@sanity/types'
import {useCallback, useEffect, useMemo, useState} from 'react'

import {useQuery} from '../query/useQuery'

const DEFAULT_PAGE_SIZE = 25
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
 */
export interface InfiniteListOptions extends QueryOptions {
  /**
   * GROQ filter expression to apply to the query
   */
  filter?: string
  /**
   * Number of items to load per page (defaults to 25)
   */
  pageSize?: number
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
 */
export interface InfiniteList {
  /**
   * Array of document handles for the current page
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
   * Function to load the next page of results
   */
  loadMore: () => void
}

/**
 * React hook for paginated document queries with infinite scrolling support
 *
 * This hook provides a convenient way to implement infinite scrolling lists of documents
 * with support for filtering, searching, and custom ordering. It handles pagination
 * automatically and provides a simple API for loading more results.
 *
 * The hook constructs and executes GROQ queries based on the provided options,
 * combining search terms, filters, and ordering specifications. It maintains the
 * current page size internally and exposes a function to load additional items.
 *
 * Usage example:
 * ```tsx
 * const {data, hasMore, isPending, loadMore} = useInfiniteList({
 *   filter: '_type == "post"',
 *   search: searchTerm,
 *   pageSize: 10,
 *   orderings: [{field: '_createdAt', direction: 'desc'}]
 * })
 * ```
 *
 * @beta
 * @param options - Configuration options for the infinite list
 * @returns An object containing the current data, loading state, and functions to load more
 */
export function useInfiniteList({
  pageSize = DEFAULT_PAGE_SIZE,
  params,
  search,
  filter,
  orderings,
  ...options
}: InfiniteListOptions): InfiniteList {
  const perspective = options.perspective ?? DEFAULT_PERSPECTIVE
  const [limit, setLimit] = useState(pageSize)

  // Reset the limit to the current pageSize whenever any query parameters
  // (filter, search, params, orderings) or pageSize changes
  const key = JSON.stringify({filter, search, params, orderings, pageSize})
  useEffect(() => {
    setLimit(pageSize)
  }, [key, pageSize])

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

  const dataQuery = `*${filterClause}${orderClause}[0...${limit}]{_id,_type}`
  const countQuery = `count(*${filterClause})`

  const {
    data: {count, data},
    isPending,
  } = useQuery<InfiniteListQueryResult>(`{"count":${countQuery},"data":${dataQuery}}`, {
    ...options,
    params,
    perspective,
  })

  const hasMore = data.length < count

  const loadMore = useCallback(() => {
    setLimit((prev) => Math.min(prev + pageSize, count))
  }, [count, pageSize])

  return useMemo(
    () => ({data, hasMore, count, isPending, loadMore}),
    [data, hasMore, count, isPending, loadMore],
  )
}
