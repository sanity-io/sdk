import {DocumentListLayout} from '@sanity/sdk-react/components'
import {useDocuments} from '@sanity/sdk-react/hooks'
import {Box, Heading} from '@sanity/ui'

import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

export function DocumentListRoute(): JSX.Element {
  const {isPending, results, hasMore, loadMore} = useDocuments({
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
