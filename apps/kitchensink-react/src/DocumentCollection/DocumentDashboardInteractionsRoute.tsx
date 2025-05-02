import {
  DocumentHandle,
  useDocuments,
  useManageFavorite,
  useNavigateToStudioDocument,
  useRecordDocumentHistoryEvent,
  useSanityInstance,
} from '@sanity/sdk-react'
import {Box, Button, Flex, Heading} from '@sanity/ui'
import {type JSX, Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {DocumentPreview} from './DocumentPreview'
import {LoadMore} from './LoadMore'

function useStudioResource<T extends DocumentHandle>(docHandle: T) {
  const {config} = useSanityInstance()
  const {projectId, dataset} = config

  return {
    ...docHandle,
    resourceId: `${projectId}.${dataset}`,
    resourceType: 'studio' as const,
  }
}

// Loading fallback for Suspense
function FavoriteStatusFallback() {
  return <Button mode="ghost" disabled text="Loading..." />
}

// Error fallback for ErrorBoundary
function FavoriteStatusError({error}: {error: Error}) {
  return <span style={{color: 'red'}}>Error: {error.message}</span>
}

function FavoriteStatus({isFavorited}: {isFavorited: boolean}) {
  return <>{isFavorited ? 'Remove from favorites' : 'Add to favorites'}</>
}

function FavoriteButton({docHandle}: {docHandle: DocumentHandle}) {
  const studioResource = useStudioResource(docHandle)
  const {favorite, unfavorite, isConnected, isFavorited} = useManageFavorite(studioResource)

  return (
    <ErrorBoundary fallbackRender={({error}) => <FavoriteStatusError error={error} />}>
      <Button
        mode="ghost"
        disabled={!isConnected}
        onClick={() => {
          if (isFavorited) {
            unfavorite()
          } else {
            favorite()
          }
        }}
        text={<FavoriteStatus isFavorited={isFavorited} />}
      />
    </ErrorBoundary>
  )
}

function ActionButtons(docHandle: DocumentHandle) {
  const {recordEvent, isConnected: isHistoryConnected} = useRecordDocumentHistoryEvent({
    ...docHandle,
    resourceType: 'studio',
  })
  const {navigateToStudioDocument, isConnected: isNavigateConnected} = useNavigateToStudioDocument(
    docHandle,
    'https://test-studio.sanity.build',
  )

  return (
    <Flex gap={2} padding={2}>
      <Suspense fallback={<FavoriteStatusFallback />}>
        <FavoriteButton docHandle={docHandle} />
      </Suspense>
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
    documentType: 'book',
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
