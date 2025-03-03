import {useDocuments} from '@sanity/sdk-react/hooks'
import {Box, Heading} from '@sanity/ui'
import {type JSX} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {SANITY_TEST_STUDIO_ID} from '../consts'
import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

export function DocumentListRoute(): JSX.Element {
  const {isPending, results, hasMore, loadMore} = useDocuments({
    datasetResourceId: SANITY_TEST_STUDIO_ID,
    filter: '_type == "book"',
    sort: [{field: '_updatedAt', direction: 'desc'}],
  })

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Document List
      </Heading>
      <Box paddingY={5}>
        <DocumentListLayout>
          {results.map((doc) => (
            <DocumentPreview key={doc._id} document={doc} />
          ))}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
        </DocumentListLayout>
      </Box>
    </Box>
  )
}
