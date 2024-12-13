import {DocumentHandle} from '@sanity/sdk'
import {useDocuments, usePreview} from '@sanity/sdk-react/hooks'
import React, {ReactElement, Suspense, useState} from 'react'
import {
  Button,
  Frame,
  Table,
  TableBody,
  TableDataCell,
  TableHead,
  TableHeadCell,
  TableRow,
  Window,
  WindowContent,
  WindowHeader,
} from 'react95'

import {AuthorDetails} from './AuthorDetails'

const LoadingRow = () => (
  <TableRow>
    <TableDataCell>Loading...</TableDataCell>
  </TableRow>
)

const AuthorRow = ({
  document,
  onClick,
}: {
  document: DocumentHandle
  onClick: () => void
}): ReactElement => {
  const ref = React.useRef(null)
  const [{title, subtitle}] = usePreview({document, ref})

  return (
    <TableRow
      ref={ref}
      onClick={onClick}
      style={{cursor: 'pointer'}}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#000080' // Classic Windows 95 selection blue
        e.currentTarget.style.color = 'white'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = ''
        e.currentTarget.style.color = ''
      }}
    >
      <TableDataCell>{title || 'Untitled'}</TableDataCell>
      <TableDataCell>{subtitle || 'No ID available'}</TableDataCell>
    </TableRow>
  )
}

export function DocumentListHooksOnly(): ReactElement {
  const [selectedDoc, setSelectedDoc] = useState<DocumentHandle | null>(null)
  const {result, loadMore, isPending} = useDocuments({
    filter: '_type == "author"',
    sort: [{field: 'name', direction: 'asc'}],
  })

  return (
    <div
      style={{
        padding: '5rem',
        background: 'teal',
        minHeight: '100vh',
      }}
    >
      <Window>
        <WindowHeader>Authors.exe</WindowHeader>
        <WindowContent>
          <Table style={{width: '100%'}}>
            <TableHead>
              <TableRow>
                <TableHeadCell>Name</TableHeadCell>
                <TableHeadCell>ID</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!result && <LoadingRow />}
              {result?.map((doc) => (
                <Suspense key={doc._id} fallback={<LoadingRow />}>
                  <AuthorRow document={doc} onClick={() => setSelectedDoc(doc)} />
                </Suspense>
              ))}
            </TableBody>
          </Table>
          <Frame
            variant="well"
            style={{
              marginTop: '16px',
              padding: '8px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Button onClick={loadMore} disabled={isPending} style={{width: 120}}>
              {isPending ? 'Loading...' : 'Load More'}
            </Button>
          </Frame>
        </WindowContent>
      </Window>

      {selectedDoc && (
        <Suspense fallback={null}>
          <AuthorDetails document={selectedDoc} onClose={() => setSelectedDoc(null)} />
        </Suspense>
      )}
    </div>
  )
}

export default DocumentListHooksOnly
