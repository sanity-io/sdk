import {type DocumentHandle, type QueryOptions} from '@sanity/sdk'
import {type SortOrderingItem} from '@sanity/types'
import {useCallback, useEffect, useMemo, useState} from 'react'

import {useQuery} from '../query/useQuery'

const DEFAULT_PERSPECTIVE = 'drafts'

/**
 * Configuration options for the usePaginatedDocuments hook
 *
 * @beta
 * @category Types
 */
export interface PaginatedDocumentsOptions extends QueryOptions {
  /**
   * GROQ filter expression to apply to the query
   */
  filter?: string
  /**
   * Number of items to display per page (defaults to 25)
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
 * Return value from the usePaginatedDocuments hook
 *
 * @beta
 * @category Types
 */
export interface PaginatedDocumentsResponse {
  /**
   * Array of document handles for the current page
   */
  data: DocumentHandle[]
  /**
   * Whether a query is currently in progress
   */
  isPending: boolean

  /**
   * Number of items displayed per page
   */
  pageSize: number
  /**
   * Current page number (1-indexed)
   */
  currentPage: number
  /**
   * Total number of pages available
   */
  totalPages: number

  /**
   * Starting index of the current page (0-indexed)
   */
  startIndex: number
  /**
   * Ending index of the current page (exclusive, 0-indexed)
   */
  endIndex: number
  /**
   * Total count of items matching the query
   */
  count: number

  /**
   * Navigate to the first page
   */
  firstPage: () => void
  /**
   * Whether there is a first page available to navigate to
   */
  hasFirstPage: boolean

  /**
   * Navigate to the previous page
   */
  previousPage: () => void
  /**
   * Whether there is a previous page available to navigate to
   */
  hasPreviousPage: boolean

  /**
   * Navigate to the next page
   */
  nextPage: () => void
  /**
   * Whether there is a next page available to navigate to
   */
  hasNextPage: boolean

  /**
   * Navigate to the last page
   */
  lastPage: () => void
  /**
   * Whether there is a last page available to navigate to
   */
  hasLastPage: boolean

  /**
   * Navigate to a specific page number
   * @param pageNumber - The page number to navigate to (1-indexed)
   */
  goToPage: (pageNumber: number) => void
}

/**
 * Retrieves pages of {@link DocumentHandle}s, narrowed by optional filters, text searches, and custom ordering,
 * with support for traditional paginated interfaces. The number of document handles returned per page is customizable,
 * while page navigation is handled via the included navigation functions.
 *
 * @beta
 * @category Documents
 * @param options - Configuration options for the paginated list
 * @returns An object containing the current page of document handles, the loading and pagination state, and navigation functions
 * @example
 * ```tsx
 * const {
 *   data,
 *   isPending,
 *   currentPage,
 *   totalPages,
 *   nextPage,
 *   previousPage,
 *   hasNextPage,
 *   hasPreviousPage
 * } = usePaginatedDocuments({
 *   filter: '_type == "post"',
 *   search: searchTerm,
 *   pageSize: 10,
 *   orderings: [{field: '_createdAt', direction: 'desc'}]
 * })
 *
 * return (
 *   <>
 *     <table>
 *       {data.map(doc => (
 *         <MyTableRowComponent key={doc._id} doc={doc} />
 *       ))}
 *     </table>
 *     {hasPreviousPage && <button onClick={previousPage}>Previous</button>}
 *     {currentPage} / {totalPages}
 *     {hasNextPage && <button onClick={nextPage}>Next</button>}
 *   </>
 * )
 * ```
 *
 */
export function usePaginatedDocuments({
  filter = '',
  pageSize = 25,
  params = {},
  orderings,
  search,
  ...options
}: PaginatedDocumentsOptions = {}): PaginatedDocumentsResponse {
  const [pageIndex, setPageIndex] = useState(0)
  const key = JSON.stringify({filter, search, params, orderings, pageSize})
  // Reset the pageIndex to 0 whenever any query parameters (filter, search,
  // params, orderings) or pageSize changes
  useEffect(() => {
    setPageIndex(0)
  }, [key])

  const startIndex = pageIndex * pageSize
  const endIndex = (pageIndex + 1) * pageSize
  const perspective = options.perspective ?? DEFAULT_PERSPECTIVE

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

  const dataQuery = `*${filterClause}${orderClause}[${startIndex}...${endIndex}]{_id,_type}`
  const countQuery = `count(*${filterClause})`

  const {
    data: {data, count},
    isPending,
  } = useQuery<{data: DocumentHandle[]; count: number}>(
    `{"data":${dataQuery},"count":${countQuery}}`,
    {
      ...options,
      perspective,
      params,
    },
  )

  const totalPages = Math.ceil(count / pageSize)
  const currentPage = pageIndex + 1

  // Navigation methods
  const firstPage = useCallback(() => setPageIndex(0), [])
  const previousPage = useCallback(() => setPageIndex((prev) => Math.max(prev - 1, 0)), [])
  const nextPage = useCallback(
    () => setPageIndex((prev) => Math.min(prev + 1, totalPages - 1)),
    [totalPages],
  )
  const lastPage = useCallback(() => setPageIndex(totalPages - 1), [totalPages])
  const goToPage = useCallback(
    (pageNumber: number) => {
      if (pageNumber < 1 || pageNumber > totalPages) return
      setPageIndex(pageNumber - 1)
    },
    [totalPages],
  )

  // Boolean flags for page availability
  const hasFirstPage = pageIndex > 0
  const hasPreviousPage = pageIndex > 0
  const hasNextPage = pageIndex < totalPages - 1
  const hasLastPage = pageIndex < totalPages - 1

  return useMemo(
    () => ({
      data,
      isPending,
      pageSize,
      currentPage,
      totalPages,
      startIndex,
      endIndex,
      count,
      firstPage,
      hasFirstPage,
      previousPage,
      hasPreviousPage,
      nextPage,
      hasNextPage,
      lastPage,
      hasLastPage,
      goToPage,
    }),
    [
      data,
      isPending,
      pageSize,
      currentPage,
      totalPages,
      startIndex,
      endIndex,
      count,
      firstPage,
      hasFirstPage,
      previousPage,
      hasPreviousPage,
      nextPage,
      hasNextPage,
      lastPage,
      hasLastPage,
      goToPage,
    ],
  )
}
