import {type DocumentHandle, useDocuments} from '@sanity/sdk-react'
import {Text, TextInput} from '@sanity/ui'
import {type JSX, useState} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {LoadMore} from '../components/LoadMore'
import {PageLayout} from '../components/PageLayout'
import {DocumentPreview} from './DocumentPreview'

export function SearchRoute(): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')

  const {isPending, data, hasMore, loadMore, count} = useDocuments({
    search: searchQuery,
    documentType: 'book',
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })

  return (
    <PageLayout title="Search documents" subtitle="Books matching the current query">
      <TextInput
        fontSize={1}
        placeholder="Search books..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
      />

      {isPending && <Text size={1}>Loading results...</Text>}

      {!isPending && (
        <Text muted size={1}>
          Found {count} {count === 1 ? 'result' : 'results'}
        </Text>
      )}

      <DocumentListLayout>
        {data.map((docHandle: DocumentHandle) => (
          <DocumentPreview {...docHandle} key={docHandle.documentId} />
        ))}
        <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
      </DocumentListLayout>
    </PageLayout>
  )
}
