import {createGroqSearchFilter, type DocumentHandle, type QueryOptions} from '@sanity/sdk'
import {type SortOrderingItem} from '@sanity/types'
import {pick} from 'lodash-es'
import {useCallback, useEffect, useMemo, useState} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useQuery} from '../query/useQuery'

/**
 * Configuration options for the usePaginatedDocuments hook
 *
 * @beta
 * @category Types
 */
export interface PaginatedDocumentsOptions<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends Omit<QueryOptions<TDocumentType, TDataset, TProjectId>, 'query'> {
  documentType?: TDocumentType | TDocumentType[]
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
export interface PaginatedDocumentsResponse<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> {
  /**
   * Array of document handles for the current page
   */
  data: DocumentHandle<TDocumentType, TDataset, TProjectId>[]
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
 * @returns An object containing the list of document handles, pagination details, and functions to navigate between pages
 *
 * @remarks
 * - The returned document handles include projectId and dataset information from the current Sanity instance
 * - This makes them ready to use with document operations and other document hooks
 * - The hook automatically uses the correct Sanity instance based on the projectId and dataset in the options
 *
 * @example Paginated list of documents with navigation
 * ```tsx
 * import {
 *   usePaginatedDocuments,
 *   createDatasetHandle,
 *   type DatasetHandle,
 *   type DocumentHandle,
 *   type SortOrderingItem,
 *   useDocumentProjection
 * } from '@sanity/sdk-react'
 * import {Suspense} from 'react'
 * import {ErrorBoundary} from 'react-error-boundary'
 *
 * // Define a component to display a single document row
 * function MyTableRowComponent({doc}: {doc: DocumentHandle}) {
 *   const {data} = useDocumentProjection<{title?: string}>({
 *     ...doc,
 *     projection: '{title}',
 *   })
 *
 *   return (
 *     <tr>
 *       <td>{data?.title ?? 'Untitled'}</td>
 *     </tr>
 *   )
 * }
 *
 * // Define props for the list component
 * interface PaginatedDocumentListProps {
 *   documentType: string
 *   dataset?: DatasetHandle
 * }
 *
 * function PaginatedDocumentList({documentType, dataset}: PaginatedDocumentListProps) {
 *   const {
 *     data,
 *     isPending,
 *     currentPage,
 *     totalPages,
 *     nextPage,
 *     previousPage,
 *     hasNextPage,
 *     hasPreviousPage
 *   } = usePaginatedDocuments({
 *     ...dataset,
 *     documentType,
 *     pageSize: 10,
 *     orderings: [{field: '_createdAt', direction: 'desc'}],
 *   })
 *
 *   return (
 *     <div>
 *       <table>
 *         <thead>
 *           <tr><th>Title</th></tr>
 *         </thead>
 *         <tbody>
 *           {data.map(doc => (
 *             <ErrorBoundary key={doc.documentId} fallback={<tr><td>Error loading document</td></tr>}>
 *               <Suspense fallback={<tr><td>Loading...</td></tr>}>
 *                 <MyTableRowComponent doc={doc} />
 *               </Suspense>
 *             </ErrorBoundary>
 *           ))}
 *         </tbody>
 *       </table>
 *       <div style={{opacity: isPending ? 0.5 : 1}}>
 *         <button onClick={previousPage} disabled={!hasPreviousPage || isPending}>Previous</button>
 *         <span>Page {currentPage} / {totalPages}</span>
 *         <button onClick={nextPage} disabled={!hasNextPage || isPending}>Next</button>
 *       </div>
 *     </div>
 *   )
 * }
 *
 * // Usage:
 * // const myDatasetHandle = createDatasetHandle({ projectId: 'p1', dataset: 'production' })
 * // <PaginatedDocumentList dataset={myDatasetHandle} documentType="post" />
 * ```
 */
export function usePaginatedDocuments<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>({
  documentType,
  filter = '',
  pageSize = 25,
  params = {},
  orderings,
  search,
  ...options
}: PaginatedDocumentsOptions<TDocumentType, TDataset, TProjectId>): PaginatedDocumentsResponse<
  TDocumentType,
  TDataset,
  TProjectId
> {
  const instance = useSanityInstance(options)
  const [pageIndex, setPageIndex] = useState(0)
  const key = JSON.stringify({filter, search, params, orderings, pageSize})
  // Reset the pageIndex to 0 whenever any query parameters (filter, search,
  // params, orderings) or pageSize changes
  useEffect(() => {
    setPageIndex(0)
  }, [key])

  const startIndex = pageIndex * pageSize
  const endIndex = (pageIndex + 1) * pageSize
  const documentTypes = (Array.isArray(documentType) ? documentType : [documentType]).filter(
    (i) => typeof i === 'string',
  )

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

    if (documentTypes?.length) {
      conditions.push(`(_type in $__types)`)
    }

    // Add additional filter if specified
    if (filter) {
      conditions.push(`(${filter})`)
    }

    return conditions.length ? `[${conditions.join(' && ')}]` : ''
  }, [filter, search, documentTypes?.length])

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

  const dataQuery = `*${filterClause}${orderClause}[${startIndex}...${endIndex}]{"documentId":_id,"documentType":_type,...$__handle}`
  const countQuery = `count(*${filterClause})`

  const {
    data: {data, count},
    isPending,
  } = useQuery<{data: DocumentHandle<TDocumentType, TDataset, TProjectId>[]; count: number}>({
    ...options,
    query: `{"data":${dataQuery},"count":${countQuery}}`,
    params: {
      ...params,
      __types: documentTypes,
      __handle: {
        ...pick(instance.config, 'projectId', 'dataset', 'perspective'),
        ...pick(options, 'projectId', 'dataset', 'perspective'),
      },
    },
  })

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

  return {
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
  }
}
