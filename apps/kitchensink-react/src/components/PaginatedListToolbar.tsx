import {Select, TextInput} from '@sanity/ui'
import {ChangeEvent, JSX} from 'react'
import {Box, Flex, Text, VStack} from 'ui5'

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
    <VStack gap={3}>
      <Flex alignItems="center" gap={3} justifyContent="space-between">
        <Box flexGrow={1} style={{maxWidth: 300}}>
          <VStack gap={2}>
            <Text as="label" htmlFor={searchId} muted size={1}>
              Search {nounLabel}
            </Text>
            <TextInput
              id={searchId}
              data-testid={`list-search-input${suffix}`}
              fontSize={1}
              value={searchTerm}
              onChange={onSearchChange}
              placeholder={`Search ${noun}...`}
            />
          </VStack>
        </Box>
        <Box>
          <VStack gap={2}>
            <Text as="label" htmlFor={pageSizeId} muted size={1}>
              Items per page
            </Text>
            <Select
              id={pageSizeId}
              data-testid={`list-page-size${suffix}`}
              fontSize={1}
              value={pageSize}
              onChange={onPageSizeChange}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </VStack>
        </Box>
      </Flex>

      <Text muted size={1} data-testid={`list-summary${suffix}`}>
        Showing {startIndex + 1}-{Math.min(endIndex, count)} of {count} {noun}
      </Text>
    </VStack>
  )
}
