import {type DocumentListOptions} from '@sanity/sdk'
import {useMemo} from 'react'

import {type DocumentHandleCollection} from './types'
import {useDocuments} from './useDocuments'

interface SearchOptions extends DocumentListOptions {
  query?: string
}

/**
 * @public
 * Hook for searching documents using full-text search.
 *
 * @param options - The options for the search.
 * @example
 * ```tsx
 * function SearchResults() {
 *   const [query, setQuery] = useState('')
 *   const {results, isPending} = useSearch({
 *     filter: '_type == "book"',
 *     query,
 *     sort: [{field: '_createdAt', direction: 'desc'}]
 *   })
 *
 *   return (
 *     <div>
 *       <input
 *         type="search"
 *         value={query}
 *         onChange={(e) => setQuery(e.target.value)}
 *         placeholder="Search books..."
 *       />
 *       {isPending ? (
 *         <div>Searching...</div>
 *       ) : (
 *         <ul>
 *           {results.map((doc) => (
 *             <li key={doc._id}>{doc._id}</li>
 *           ))}
 *         </ul>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 */
export function useSearch({
  query,
  filter: additionalFilter,
  ...options
}: SearchOptions = {}): DocumentHandleCollection {
  // Build the complete GROQ filter
  const filter = useMemo(() => {
    const conditions: string[] = []

    // Add search query if specified
    if (query?.trim()) {
      conditions.push(`[@] match text::query("${query.trim()}")`)
    }

    // Add additional filter if specified
    if (additionalFilter) {
      conditions.push(`(${additionalFilter})`)
    }

    return conditions.length ? conditions.join(' && ') : ''
  }, [query, additionalFilter])

  // Use the existing useDocuments hook with our constructed filter
  return useDocuments({
    ...options,
    filter,
  })
}
