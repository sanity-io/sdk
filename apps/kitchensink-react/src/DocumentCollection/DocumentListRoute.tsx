import {useDocuments} from '@sanity/sdk-react'
import {Box, Heading} from '@sanity/ui'
import {type JSX} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

export function DocumentListRoute(): JSX.Element {
  const {isPending, data, hasMore, loadMore} = useDocuments({
    documentType: 'author',
    orderings: [{field: '_updatedAt', direction: 'asc'}],
  })

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Document List
      </Heading>
      <Box paddingY={5}>
        <DocumentListLayout>
          {data.map((docHandle) => (
            <DocumentPreview key={docHandle.documentId} {...docHandle} />
          ))}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
        </DocumentListLayout>
      </Box>
    </Box>
  )
}
