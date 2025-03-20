import {DocumentHandle} from '@sanity/sdk'
import {usePaginatedList, useProjection} from '@sanity/sdk-react'
import {Box, Button, Card, Flex, Label, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {JSX, ReactNode, Suspense, useRef, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

// Import the custom table components
import {Table, TD, TH, TR} from '../components/TableElements'

interface AuthorProjection {
  name: string
  address: string
  favoriteBookTitles: string[]
}

// Component for displaying projection data with proper error handling
function ProjectionData(docHandle: DocumentHandle) {
  const ref = useRef<HTMLTableCellElement>(null)
  const {data} = useProjection<AuthorProjection>({
    ...docHandle,
    ref,
    projection: `{
      name,
      "address": "City: " + address.city + ", Country: " + address.country,
      "favoriteBookTitles": favoriteBooks[]->{title}.title
    }`,
  })

  return (
    <>
      <TD ref={ref} padding={2}>
        {data.name || 'Untitled'}
      </TD>
      <TD padding={2}>{data.address || 'No address'}</TD>
      <TD padding={2}>
        {data.favoriteBookTitles.filter(Boolean).join(', ') || 'No favorite books'}
      </TD>
    </>
  )
}

// Loading fallback for Suspense
function ProjectionFallback() {
  return (
    <>
      <TD padding={2}>
        <Spinner />
      </TD>
      <TD padding={2} />
      <TD padding={2} />
    </>
  )
}

// Error fallback for ErrorBoundary
function ProjectionError({error}: {error: Error}): ReactNode {
  return (
    <TD padding={2}>
      <div style={{gridColumn: 'span 3'}}>
        <Text size={1} style={{color: 'red'}}>
          Error: {error.message}
        </Text>
      </div>
    </TD>
  )
}

// Component for displaying a single author row with projection data
function AuthorRow(docHandle: DocumentHandle) {
  return (
    <TR>
      <ErrorBoundary fallbackRender={({error}) => <ProjectionError error={error} />}>
        <Suspense fallback={<ProjectionFallback />}>
          <ProjectionData {...docHandle} />
        </Suspense>
      </ErrorBoundary>
    </TR>
  )
}

// Define interface for pagination controls props
interface PaginationControlsProps {
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

// Pagination controls component
function PaginationControls({
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
}: PaginationControlsProps) {
  const buttonStyle = {
    minWidth: '40px',
    margin: '0 4px',
    textAlign: 'center',
  } as const

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

export function DocumentProjectionRoute(): JSX.Element {
  const [searchTerm, setSearchTerm] = useState('')
  const [pageSize, setPageSize] = useState(5)

  const {
    data,
    isPending,
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
    count,
    startIndex,
    endIndex,
  } = usePaginatedList({
    filter: '_type == "author" && count(favoriteBooks) > 0',
    orderings: [{field: 'name', direction: 'asc'}],
    search: searchTerm,
    pageSize,
  })

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.currentTarget.value)
  }

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(event.currentTarget.value))
  }

  return (
    <Stack space={4}>
      <Card padding={4}>
        <Stack space={4}>
          <Flex justify="space-between" align="center">
            <Box style={{width: '300px'}}>
              <Label htmlFor="search" size={1} style={{marginBottom: '4px', display: 'block'}}>
                Search Authors
              </Label>
              <TextInput
                id="search"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search by name..."
                style={{width: '100%'}}
              />
            </Box>
            <Box>
              <Label htmlFor="pageSize" size={1} style={{marginBottom: '4px', display: 'block'}}>
                Items per page
              </Label>
              <select
                id="pageSize"
                value={pageSize}
                onChange={handlePageSizeChange}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </Box>
          </Flex>

          <Box style={{borderRadius: '4px', border: '1px solid #eee', padding: '8px'}}>
            <Text size={1}>
              Showing {startIndex + 1}-{Math.min(endIndex, count)} of {count} authors
            </Text>
          </Box>

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            hasFirstPage={hasFirstPage}
            hasPreviousPage={hasPreviousPage}
            hasNextPage={hasNextPage}
            hasLastPage={hasLastPage}
            firstPage={firstPage}
            previousPage={previousPage}
            nextPage={nextPage}
            lastPage={lastPage}
            goToPage={goToPage}
            isPending={isPending}
          />

          <Table style={{opacity: isPending ? 0.5 : 1}}>
            <thead>
              <TR>
                <TH padding={2}>Name</TH>
                <TH padding={2}>Address</TH>
                <TH padding={2}>Favorite Books</TH>
              </TR>
            </thead>
            <tbody>
              {data.length > 0 ? (
                data.map((doc) => <AuthorRow key={doc.documentId} {...doc} />)
              ) : (
                <TR>
                  <TD padding={2}>
                    <div style={{gridColumn: 'span 3', textAlign: 'center', width: '100%'}}>
                      {isPending ? (
                        <Flex justify="center" align="center">
                          <Spinner />
                          <Text size={2} style={{marginLeft: '8px'}}>
                            Loading authors...
                          </Text>
                        </Flex>
                      ) : (
                        <Text>No authors found</Text>
                      )}
                    </div>
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            hasFirstPage={hasFirstPage}
            hasPreviousPage={hasPreviousPage}
            hasNextPage={hasNextPage}
            hasLastPage={hasLastPage}
            firstPage={firstPage}
            previousPage={previousPage}
            nextPage={nextPage}
            lastPage={lastPage}
            goToPage={goToPage}
            isPending={isPending}
          />
        </Stack>
      </Card>
    </Stack>
  )
}
