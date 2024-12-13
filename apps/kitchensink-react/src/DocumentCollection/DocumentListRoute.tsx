import {DocumentListLayout} from '@sanity/sdk-react/components'
import {useDocuments} from '@sanity/sdk-react/hooks'
import {Box, Heading} from '@sanity/ui'

import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

export function DocumentListRoute(): JSX.Element {
  const {result, loadMore, isPending} = useDocuments({
    filter: '_type == "author"',
    sort: [{field: 'name', direction: 'asc'}],
  })

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Document List
      </Heading>
      <Box paddingY={5}>
        <DocumentListLayout>
          {result?.map((doc) => <DocumentPreview key={doc._id} document={doc} />)}
          <LoadMore isPending={isPending} onLoadMore={loadMore} />
        </DocumentListLayout>
      </Box>
    </Box>
  )
}
