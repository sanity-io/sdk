import {JSX} from 'react'
import {Button, Flex, Text} from 'ui5'

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
          data-testid={`pagination-page-${i}`}
          level={i === currentPage ? 'primary' : 'tertiary'}
          onClick={() => goToPage(i)}
          style={buttonStyle}
          text={String(i)}
        />,
      )
    }
    return buttons
  }

  return (
    <Flex
      alignItems="center"
      data-testid="pagination-controls"
      justifyContent="space-between"
      padding={3}
    >
      <Flex>
        <Button
          data-testid="pagination-first"
          disabled={!hasFirstPage}
          level="tertiary"
          onClick={firstPage}
          style={buttonStyle}
          text="<<"
        />
        <Button
          data-testid="pagination-previous"
          disabled={!hasPreviousPage}
          level="tertiary"
          onClick={previousPage}
          style={buttonStyle}
          text="<"
        />
        {pageButtons()}
        <Button
          data-testid="pagination-next"
          disabled={!hasNextPage}
          level="tertiary"
          onClick={nextPage}
          style={buttonStyle}
          text=">"
        />
        <Button
          data-testid="pagination-last"
          disabled={!hasLastPage}
          level="tertiary"
          onClick={lastPage}
          style={buttonStyle}
          text=">>"
        />
      </Flex>
      <Text data-testid="pagination-status" size={1} style={{opacity: isPending ? 0.5 : 1}}>
        Page {currentPage} of {totalPages}
      </Text>
    </Flex>
  )
}
