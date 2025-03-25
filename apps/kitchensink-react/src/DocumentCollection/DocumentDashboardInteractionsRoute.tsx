import {
  DocumentHandle,
  useDocuments,
  useManageFavorite,
  useNavigateToStudioDocument,
  useRecordDocumentHistoryEvent,
} from '@sanity/sdk-react'
import {Box, Button, Flex, Heading} from '@sanity/ui'
import {type JSX} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

function ActionButtons({document}: {document: DocumentHandle}) {
  const {
    favorite,
    unfavorite,
    isFavorited,
    isConnected: isFavoriteConnected,
  } = useManageFavorite({
    documentId: document._id,
    documentType: document._type,
    resourceType: 'studio',
    resourceId: document.resourceId,
  })
  const {recordEvent, isConnected: isHistoryConnected} = useRecordDocumentHistoryEvent({
    documentId: document._id,
    documentType: document._type,
    resourceType: 'studio',
    resourceId: document.resourceId,
  })
  const {navigateToStudioDocument, isConnected: isNavigateConnected} =
    useNavigateToStudioDocument(document)

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
      <Button
        mode="ghost"
        disabled={!isNavigateConnected}
        onClick={navigateToStudioDocument}
        text="Edit in Studio"
      />
    </Flex>
  )
}

export function DocumentDashboardInteractionsRoute(): JSX.Element {
  const {isPending, data, hasMore, loadMore} = useDocuments({
    filter: '_type == "book"',
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })

  // since resourceIds are being refactored at the moment, hardcode the resourceId for now
  // (ideally, they come from document handles returned in the "data" param per document)
  const datasetResourceId = 'document:ppsg7ml5.test:' // Note: each doc._id will be appended to this

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Document Actions Demo
      </Heading>
      <Box paddingY={5}>
        <DocumentListLayout>
          {data.map((doc) => (
            <Box key={doc._id}>
              <DocumentPreview document={doc} />
              <ActionButtons document={{...doc, resourceId: `${datasetResourceId}${doc._id}`}} />
            </Box>
          ))}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
        </DocumentListLayout>
      </Box>
    </Box>
  )
}
