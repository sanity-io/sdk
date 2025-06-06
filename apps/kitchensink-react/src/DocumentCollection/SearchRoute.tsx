import {type DocumentHandle, useDocuments} from '@sanity/sdk-react'
import {Box, Heading, Stack, Text, TextInput} from '@sanity/ui'
import {type JSX, useState} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

export function SearchRoute(): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')

  const {isPending, data, hasMore, loadMore, count} = useDocuments({
    search: searchQuery,
    documentType: 'book',
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Heading as="h1" size={5}>
          Search Documents
        </Heading>

        <Box>
          <TextInput
            placeholder="Search books..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
        </Box>

        {isPending && <Text>Loading results...</Text>}

        {!isPending && (
          <Text>
            Found {count} {count === 1 ? 'result' : 'results'}
          </Text>
        )}

        <DocumentListLayout>
          {data.map((docHandle: DocumentHandle) => (
            <DocumentPreview {...docHandle} key={docHandle.documentId} />
          ))}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
        </DocumentListLayout>
      </Stack>
    </Box>
  )
}
