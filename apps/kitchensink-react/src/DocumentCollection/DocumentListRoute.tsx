import {useInfiniteList} from '@sanity/sdk-react/hooks'
import {Box, Heading} from '@sanity/ui'
import {type JSX} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

export function DocumentListRoute(): JSX.Element {
  const {isPending, data, hasMore, loadMore} = useInfiniteList({
    filter: '_type == "book"',
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Document List
      </Heading>
      <Box paddingY={5}>
        <DocumentListLayout>
          {data.map((doc) => (
            <DocumentPreview key={doc._id} document={doc} />
          ))}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
        </DocumentListLayout>
      </Box>
    </Box>
  )
}
