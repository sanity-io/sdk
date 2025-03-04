import {DocumentHandle} from '@sanity/sdk'
import {useDocuments, useProjection} from '@sanity/sdk-react/hooks'
import {Card, Spinner, Stack, Text} from '@sanity/ui'
import {JSX, ReactNode, Suspense, useRef} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

// Import the custom table components
import {Table, TD, TH, TR} from '../components/TableElements'
import {LoadMore} from './LoadMore'

interface AuthorProjection {
  name: string
  address: string
  favoriteBookTitles: string[]
}

// Component for displaying projection data with proper error handling
function ProjectionData({results}: {results: AuthorProjection}) {
  return (
    <>
      <TD padding={2}>{results.name || 'Untitled'}</TD>
      <TD padding={2}>{results.address || 'No address'}</TD>
      <TD padding={2}>
        {results.favoriteBookTitles.filter(Boolean).join(', ') || 'No favorite books'}
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
      <Text size={1} style={{color: 'red'}}>
        Error: {error.message}
      </Text>
    </TD>
  )
}

// Component for displaying a single author row with projection data
function AuthorRow({document}: {document: DocumentHandle}) {
  const ref = useRef<HTMLTableRowElement>(null)

  const {results} = useProjection<AuthorProjection>({
    document,
    projection: `
      name,
      "address": "City: " + address.city + ", Country: " + address.country,
      "favoriteBookTitles": favoriteBooks[]->{title}.title
    `,
    ref,
  })

  return (
    <TR ref={ref}>
      <ErrorBoundary fallbackRender={({error}) => <ProjectionError error={error} />}>
        <Suspense fallback={<ProjectionFallback />}>
          <ProjectionData results={results} />
        </Suspense>
      </ErrorBoundary>
    </TR>
  )
}

export default function UseProjectionExample(): JSX.Element {
  const {results, isPending, hasMore, loadMore} = useDocuments({
    filter: '_type == "author" && count(favoriteBooks) > 0',
    sort: [{field: 'name', direction: 'asc'}],
  })

  return (
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
          <tbody>
            {results.map((doc) => (
              <AuthorRow key={doc._id} document={doc} />
            ))}
          </tbody>
        </Table>
        <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} as="div" />
      </Card>
    </Stack>
  )
}
