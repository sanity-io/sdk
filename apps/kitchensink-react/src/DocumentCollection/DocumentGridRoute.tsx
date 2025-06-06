import {useDocuments} from '@sanity/sdk-react'
import {Box, Button, Heading} from '@sanity/ui'
import {type JSX} from 'react'

import {DocumentGridLayout} from '../components/DocumentGridLayout/DocumentGridLayout'
import {DocumentPreview} from './DocumentPreview'

export function DocumentGridRoute(): JSX.Element {
  const {isPending, data, hasMore, loadMore} = useDocuments({
    documentType: 'author',
    orderings: [{field: 'name', direction: 'asc'}],
  })

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Document Grid
      </Heading>
      <Box paddingY={5}>
        <DocumentGridLayout>
          {data.map((doc) => (
            <DocumentPreview key={doc.documentId} {...doc} />
          ))}
        </DocumentGridLayout>
        <Button text="Load more" mode="ghost" disabled={isPending || !hasMore} onClick={loadMore} />
      </Box>
    </Box>
  )
}
