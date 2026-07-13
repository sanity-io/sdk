import {Button, Flex, Text} from '@sanity/ui'
import {JSX} from 'react'

// Props mirror the pagination slice of the `usePaginatedDocuments` return value.
export interface PaginationControlsProps {
  currentPage: number
  totalPages: number
  hasFirstPage: boolean
  hasPreviousPage: boolean
  hasNextPage: boolean
  hasLastPage: boolean
  firstPage: () => void
  previousPage: () => void
  nextPage: () => void
  lastPage: () => void
  goToPage: (pageNumber: number) => void
  isPending: boolean
}

const buttonStyle = {
  minWidth: '40px',
  margin: '0 4px',
  textAlign: 'center',
} as const

// Shared pagination bar: first/prev/next/last plus a windowed set of numbered
// page buttons and a "Page X of Y" indicator.
export function PaginationControls({
  currentPage,
  totalPages,
  hasFirstPage,
  hasPreviousPage,
  hasNextPage,
  hasLastPage,
  firstPage,
  previousPage,
  nextPage,
  lastPage,
  goToPage,
  isPending,
}: PaginationControlsProps): JSX.Element {
  // Generate page number buttons
  const pageButtons = () => {
    const buttons = []
    const maxVisiblePages = 5
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1)
    }

    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <Button
          key={i}
          mode={i === currentPage ? 'default' : 'ghost'}
          onClick={() => goToPage(i)}
          style={{
            ...buttonStyle,
            fontWeight: i === currentPage ? 'bold' : 'normal',
          }}
        >
          {i}
        </Button>,
      )
    }
    return buttons
  }

  return (
    <Flex align="center" justify="space-between" padding={3}>
      <Flex>
        <Button
          onClick={firstPage}
          disabled={!hasFirstPage}
          style={buttonStyle}
          text="<<"
          mode="ghost"
        />
        <Button
          onClick={previousPage}
          disabled={!hasPreviousPage}
          style={buttonStyle}
          text="<"
          mode="ghost"
        />
        {pageButtons()}
        <Button
          onClick={nextPage}
          disabled={!hasNextPage}
          style={buttonStyle}
          text=">"
          mode="ghost"
        />
        <Button
          onClick={lastPage}
          disabled={!hasLastPage}
          style={buttonStyle}
          text=">>"
          mode="ghost"
        />
      </Flex>
      <Text size={1} style={{opacity: isPending ? 0.5 : 1}}>
        Page {currentPage} of {totalPages}
      </Text>
    </Flex>
  )
}
