import {SanityDocument, useDispatchIntent, useQuery} from '@sanity/sdk-react'
import {Button, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {Code} from '@sanity/ui/code'
import {type JSX, Suspense} from 'react'

import {PageLayout} from '../components/PageLayout'

const PROJECT_ID = 'ppsg7ml5'
const DATASET = 'test'
const MOVIE_PROJECT_ID = 'vo1ysemo'
const MOVIE_DATASET = 'production'

function DatasetDocumentIntent({document}: {document: SanityDocument}): JSX.Element {
  const {dispatchIntent} = useDispatchIntent({
    action: 'edit',
    documentHandle: {
      documentId: document._id,
      documentType: document._type,
      projectId: PROJECT_ID,
      dataset: DATASET,
    },
  })

  return (
    <Button
      fontSize={1}
      text={`Dispatch Intent for Dataset Document (${PROJECT_ID})`}
      tone="primary"
      onClick={() => dispatchIntent()}
    />
  )
}

function MovieDocumentIntent({document}: {document: SanityDocument}): JSX.Element {
  const {dispatchIntent} = useDispatchIntent({
    action: 'edit',
    documentHandle: {
      documentId: document._id,
      documentType: document._type,
      projectId: MOVIE_PROJECT_ID,
      dataset: MOVIE_DATASET,
    },
  })

  return (
    <Button
      fontSize={1}
      text={`Dispatch Intent for Movie (${MOVIE_PROJECT_ID})`}
      tone="primary"
      onClick={() => dispatchIntent()}
    />
  )
}

function MediaLibraryAssetIntent({asset}: {asset: {_id: string; _type: string}}): JSX.Element {
  const {dispatchIntent} = useDispatchIntent({
    action: 'edit',
    documentHandle: {
      documentId: asset._id,
      documentType: asset._type,
      resourceName: 'media-library',
    },
  })

  return (
    <Button
      fontSize={1}
      text="Dispatch Intent for Media Library Asset"
      tone="primary"
      onClick={() => dispatchIntent()}
    />
  )
}

function CanvasDocumentIntent({document}: {document: SanityDocument}): JSX.Element {
  const {dispatchIntent} = useDispatchIntent({
    action: 'edit',
    documentHandle: {
      documentId: document._id,
      documentType: document._type,
      resource: {
        canvasId: 'cag5gSK37IGV',
      },
    },
  })
  return (
    <Button
      fontSize={1}
      text="Dispatch Intent for Canvas Document"
      tone="primary"
      onClick={() => dispatchIntent()}
    />
  )
}

function IntentCard({
  title,
  meta,
  documentId,
  documentType,
  children,
}: {
  title: string
  meta: string
  documentId?: string
  documentType?: string
  children: JSX.Element
}): JSX.Element {
  return (
    <Card padding={4} radius={2} shadow={1}>
      <Stack gap={3}>
        <Text size={1} weight="semibold">
          {title}
        </Text>
        <Text muted size={1}>
          {meta}
        </Text>
        {documentId && (
          <Text muted size={1}>
            Document ID: <Code>{documentId}</Code>
          </Text>
        )}
        {documentType && (
          <Text muted size={1}>
            Document Type: <Code>{documentType}</Code>
          </Text>
        )}
        {children}
      </Stack>
    </Card>
  )
}

function IntentsContent(): JSX.Element {
  const {data: firstDocument, isPending: isDocumentPending} = useQuery<SanityDocument>({
    query: '*[_type == "book"][0]',
    projectId: PROJECT_ID,
    dataset: DATASET,
  })

  const {data: firstMovie, isPending: isMoviePending} = useQuery<SanityDocument>({
    query: '*[_type == "movie"][0]',
    projectId: MOVIE_PROJECT_ID,
    dataset: MOVIE_DATASET,
  })

  const {data: firstAsset, isPending: isAssetPending} = useQuery<SanityDocument>({
    query: '*[_type == "sanity.asset"][0]',
    resourceName: 'media-library',
  })

  const {data: firstCanvasDocument, isPending: isCanvasDocumentPending} = useQuery<SanityDocument>({
    query: '*[_type == "sanity.canvas.document"][0]',
    resource: {
      canvasId: 'cag5gSK37IGV',
    },
  })

  const isLoading = isDocumentPending || isMoviePending || isAssetPending || isCanvasDocumentPending

  return (
    <PageLayout
      title="Intent Dispatch Demo"
      subtitle="Dispatch edit intents for documents from different resources"
    >
      <Stack gap={4}>
        <Text size={1} muted>
          This route demonstrates dispatching intents for documents from both a traditional dataset
          and a media library resource.
        </Text>

        {isLoading && (
          <Card padding={4} radius={2} shadow={1}>
            <Flex align="center" gap={2}>
              <Spinner />
              <Text size={1}>Loading documents...</Text>
            </Flex>
          </Card>
        )}

        <IntentCard
          title="Dataset Document Intent"
          meta={`Project: ${PROJECT_ID} | Dataset: ${DATASET}`}
          documentId={firstDocument?._id}
          documentType={firstDocument?._type}
        >
          <DatasetDocumentIntent document={firstDocument} />
        </IntentCard>

        <IntentCard
          title="Movie Document Intent"
          meta={`Project: ${MOVIE_PROJECT_ID} | Dataset: ${MOVIE_DATASET}`}
          documentId={firstMovie?._id}
          documentType={firstMovie?._type}
        >
          <MovieDocumentIntent document={firstMovie} />
        </IntentCard>

        <IntentCard title="Media Library Asset Intent" meta="Resource Name: media-library">
          <MediaLibraryAssetIntent asset={firstAsset} />
        </IntentCard>

        <IntentCard
          title="Canvas Document Intent"
          meta="Resource Name: canvas"
          documentId={firstCanvasDocument?._id}
          documentType={firstCanvasDocument?._type}
        >
          <CanvasDocumentIntent document={firstCanvasDocument} />
        </IntentCard>
      </Stack>
    </PageLayout>
  )
}

export function IntentsRoute(): JSX.Element {
  return (
    <Suspense
      fallback={
        <PageLayout title="Intent Dispatch Demo" subtitle="Loading documents">
          <Card padding={4} radius={2} shadow={1}>
            <Flex align="center" gap={2}>
              <Spinner />
              <Text size={1}>Loading...</Text>
            </Flex>
          </Card>
        </PageLayout>
      }
    >
      <IntentsContent />
    </Suspense>
  )
}
