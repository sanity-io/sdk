import {DocumentHandle} from '@sanity/sdk'
import {useDocuments, useProjection} from '@sanity/sdk-react/hooks'
import {Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {JSX, Suspense, useMemo, useRef} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

// Import the custom table components
import {Table, TD, TH, TR} from '../components/TableElements'

// Component for displaying projection data with proper error handling
function ProjectionData({document}: {document: DocumentHandle}) {
  const {results} = useProjection({
    document,
    projection: `
      name,
      address,
      "favoriteBookTitles": array::join(favoriteBooks[]->{title}.title, ', ')
    `,
  })
  // if (id === '2166475c-87ae-4c01-8d46-9f9c490fe489') {
  //   console.log('results', results)
  // }

  return (
    <>
      {/* @ts-expect-error - Projection result is not typed */}
      <TD padding={2}>{results?.name || 'Untitled'}</TD>
      {/* @ts-expect-error - Projection result is not typed */}
      <TD padding={2}>{JSON.stringify(results?.address) || 'No address'}</TD>
      {/* @ts-expect-error - Projection result is not typed */}
      <TD padding={2}>{results?.favoriteBookTitles || 'No favorite books'}</TD>
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
function ProjectionError({error}: {error: Error}) {
  return (
    <TD padding={2}>
      <Text size={1} style={{color: 'red'}}>
        Error: {error.message}
      </Text>
    </TD>
  )
}

// Component for displaying a single author row with projection data
function AuthorRow({document}: {document: DocumentHandle}) {
  const ref = useRef<HTMLTableRowElement>(null)

  return (
    // @ts-expect-error - ref is not typed
    <TR ref={ref}>
      {/* @ts-expect-error - Projection error is not typed */}
      <ErrorBoundary fallback={({error}) => <ProjectionError error={error} />}>
        <Suspense fallback={<ProjectionFallback />}>
          <ProjectionData document={document} />
        </Suspense>
      </ErrorBoundary>
    </TR>
  )
}

export default function UseProjectionExample(): JSX.Element {
  // Fetch authors with at least one favorite book
  const {results: documents, isPending} = useDocuments({
    filter: '_type == "author" && count(favoriteBooks) > 0',
    sort: [{field: 'name', direction: 'asc'}],
  })

  // Memoize the table content to avoid unnecessary renders
  const tableContent = useMemo(() => {
    if (isPending) {
      return (
        <TR>
          <TD padding={4}>
            <Flex justify="center">
              <Spinner />
            </Flex>
          </TD>
        </TR>
      )
    }

    if (!documents || documents.length === 0) {
      return (
        <TR>
          <TD padding={4}>
            <Flex justify="center">
              <Text>No authors with favorite books found</Text>
            </Flex>
          </TD>
        </TR>
      )
    }

    return documents.map((doc) => <AuthorRow key={doc._id} document={doc} />)
  }, [documents, isPending])

  return (
    <>
      <Stack space={4}>
        <Card>
          <Table>
            <thead>
              <TR>
                <TH padding={2}>Name</TH>
                <TH padding={2}>Address</TH>
                <TH padding={2}>Favorite Books</TH>
              </TR>
            </thead>
            <tbody>{tableContent}</tbody>
          </Table>
        </Card>
      </Stack>
    </>
  )
}
