import {
  DocumentHandle,
  useInfiniteList,
  useManageFavorite,
  useRecordDocumentHistoryEvent,
} from '@sanity/sdk-react'
import {Box, Button, Flex, Heading} from '@sanity/ui'
import {type JSX} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

function ActionButtons(docHandle: DocumentHandle) {
  const {
    favorite,
    unfavorite,
    isFavorited,
    isConnected: isFavoriteConnected,
  } = useManageFavorite(docHandle)
  const {recordEvent, isConnected: isHistoryConnected} = useRecordDocumentHistoryEvent(docHandle)

  return (
    <Flex gap={2} padding={2}>
      <Button
        mode="ghost"
        disabled={!isFavoriteConnected}
        onClick={() => {
          if (isFavorited) {
            unfavorite()
          } else {
            favorite()
          }
        }}
        text={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      />
      <Button
        mode="ghost"
        disabled={!isHistoryConnected}
        onClick={() => recordEvent('viewed')}
        text="Record view"
      />
    </Flex>
  )
}

export function DocumentCoreInteractionsRoute(): JSX.Element {
  const {isPending, data, hasMore, loadMore} = useInfiniteList({
    filter: '_type == "book"',
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Document Actions Demo
      </Heading>
      <Box paddingY={5}>
        <DocumentListLayout>
          {data.map((doc) => (
            <Box key={doc.documentId}>
              <DocumentPreview {...doc} />
              <ActionButtons {...doc} />
            </Box>
          ))}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
        </DocumentListLayout>
      </Box>
    </Box>
  )
}
