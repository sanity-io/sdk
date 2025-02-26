import {
  useDocumentInteractionHistory,
  useDocuments,
  useManageFavorite,
} from '@sanity/sdk-react/hooks'
import {Box, Button, Flex, Heading} from '@sanity/ui'
import {type JSX} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

interface ActionButtonsProps {
  document: {_id: string; _type: string}
}

function ActionButtons({document}: ActionButtonsProps) {
  const {
    favorite,
    unfavorite,
    isFavorited,
    isConnected: isFavoriteConnected,
  } = useManageFavorite(document)
  const {recordEvent, isConnected: isHistoryConnected} = useDocumentInteractionHistory(document)

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
  const {isPending, results, hasMore, loadMore} = useDocuments({
    filter: '_type == "book"',
    sort: [{field: '_updatedAt', direction: 'desc'}],
  })

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Document Actions Demo
      </Heading>
      <Box paddingY={5}>
        <DocumentListLayout>
          {results.map((doc) => (
            <Box key={doc._id}>
              <DocumentPreview document={doc} />
              <ActionButtons document={doc} />
            </Box>
          ))}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
        </DocumentListLayout>
      </Box>
    </Box>
  )
}
