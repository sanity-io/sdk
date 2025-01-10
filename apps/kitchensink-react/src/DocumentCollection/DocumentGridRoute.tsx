import {DocumentGridLayout} from '@sanity/sdk-react/components'
import {useDocuments} from '@sanity/sdk-react/hooks'
import {Box, Button, Heading} from '@sanity/ui'
import type {JSX} from 'react'

import {DocumentPreview} from './DocumentPreview'

export function DocumentGridRoute(): JSX.Element {
  const {isPending, results, hasMore, loadMore} = useDocuments({
    filter: '_type == "author"',
    sort: [{field: 'name', direction: 'asc'}],
  })

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Document Grid
      </Heading>
      <Box paddingY={5}>
        <DocumentGridLayout>
          {results.map((doc) => (
            <DocumentPreview key={doc._id} document={doc} />
          ))}
        </DocumentGridLayout>
        <Button text="Load more" mode="ghost" disabled={isPending || !hasMore} onClick={loadMore} />
      </Box>
    </Box>
  )
}
