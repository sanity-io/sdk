import {Box, Flex, Label, Text, TextInput} from '@sanity/ui'
import {ChangeEvent, JSX} from 'react'

export interface PaginatedListToolbarProps {
  // The plural noun for the listed items, e.g. "documents" or "authors". Used
  // in the summary text and, capitalized, in the search field label.
  noun: string
  searchTerm: string
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void
  pageSize: number
  onPageSizeChange: (event: ChangeEvent<HTMLSelectElement>) => void
  count: number
  startIndex: number
  endIndex: number
  // Optional suffix to keep input ids unique when several toolbars render on
  // the same page.
  idSuffix?: string
}

const pageSizeOptions = [5, 10, 25, 50]

// Shared list toolbar: a search field, a page-size selector, and a
// "Showing X-Y of Z" summary. Pagination state is owned by the caller (via
// `usePaginatedDocuments`) and passed in.
export function PaginatedListToolbar({
  noun,
  searchTerm,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  count,
  startIndex,
  endIndex,
  idSuffix = '',
}: PaginatedListToolbarProps): JSX.Element {
  const nounLabel = noun.charAt(0).toUpperCase() + noun.slice(1)
  // Only append a suffix segment when one is provided, so single-toolbar pages
  // keep stable ids/test ids (`list-page-size`) while multiple toolbars stay
  // unique (`list-page-size-author`).
  const suffix = idSuffix ? `-${idSuffix}` : ''
  const searchId = `search${suffix}`
  const pageSizeId = `pageSize${suffix}`

  return (
    <>
      <Flex justify="space-between" align="center">
        <Box style={{width: '300px'}}>
          <Label htmlFor={searchId} size={1} style={{marginBottom: '4px', display: 'block'}}>
            Search {nounLabel}
          </Label>
          <TextInput
            id={searchId}
            data-testid={`list-search-input${suffix}`}
            value={searchTerm}
            onChange={onSearchChange}
            placeholder={`Search ${noun}...`}
            style={{width: '100%'}}
          />
        </Box>
        <Box>
          <Label htmlFor={pageSizeId} size={1} style={{marginBottom: '4px', display: 'block'}}>
            Items per page
          </Label>
          <select
            id={pageSizeId}
            data-testid={`list-page-size${suffix}`}
            value={pageSize}
            onChange={onPageSizeChange}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
            }}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </Box>
      </Flex>

      <Box style={{borderRadius: '4px', border: '1px solid #eee', padding: '8px'}}>
        <Text size={1} data-testid={`list-summary${suffix}`}>
          Showing {startIndex + 1}-{Math.min(endIndex, count)} of {count} {noun}
        </Text>
      </Box>
    </>
  )
}
