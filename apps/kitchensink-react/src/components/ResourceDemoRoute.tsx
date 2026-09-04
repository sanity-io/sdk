import {
  useDocumentPreview,
  useDocumentProjection,
  useDocumentSyncStatus,
  useQuery,
} from '@sanity/sdk-react'
import {Button, Dialog} from '@sanity/ui'
import {type JSX, type ReactNode, Suspense, useState} from 'react'
import {type SanityDocument} from 'sanity'
import {Box, Card, Code, Flex, Grid, Spinner, Text, VStack} from 'ui5'

import {DocumentEditorPanel} from './DocumentEditorPanel'
import {JsonDocumentEditor} from './JsonDocumentEditor'
import {PageLayout} from './PageLayout'

interface EditorConfig {
  nameField: string
  nameLabel: string
}

interface ResourceDemoRouteProps {
  title: string
  description: ReactNode
  resourceName: string
  documentType: string
  initialQuery: string
  projection: string
  itemNoun: string
  editor: EditorConfig
}

function ItemEditorDialog({
  itemNoun,
  documentId,
  documentType,
  resourceName,
  editor,
  open,
  onClose,
}: {
  itemNoun: string
  documentId: string
  documentType: string
  resourceName: string
  editor: EditorConfig
  open: boolean
  onClose: () => void
}) {
  const docHandle = {documentType, documentId, resourceName}
  const synced = useDocumentSyncStatus(docHandle)

  return (
    <Dialog
      header={`Edit ${itemNoun}: ${documentId}`}
      id={`${resourceName}-item-editor`}
      onClose={onClose}
      open={open}
      width={2}
    >
      <Box padding={4}>
        <Suspense fallback={<Spinner />}>
          <VStack gap={4}>
            <DocumentEditorPanel
              docHandle={docHandle}
              nameField={editor.nameField}
              nameLabel={editor.nameLabel}
            />
            <JsonDocumentEditor documentHandle={docHandle} minHeight="500px" maxHeight="70vh" />
          </VStack>
        </Suspense>
        <Flex justifyContent="flex-end" gap={2} marginTop={4}>
          <Button text={synced ? 'Close' : 'Syncing...'} onClick={onClose} tone="primary" />
        </Flex>
      </Box>
    </Dialog>
  )
}

function JsonBlock({
  title,
  testId,
  value,
  isPending,
}: {
  title: string
  testId: string
  value: unknown
  isPending?: boolean
}) {
  return (
    <Card density="regular">
      <VStack gap={3}>
        <Flex alignItems="center" gap={2}>
          <Text size={1} weight="semibold">
            {title}
          </Text>
          {isPending && <Spinner />}
        </Flex>
        <Box overflow="auto" padding={3} style={{maxHeight: 400}}>
          <Code data-testid={testId} language="json">
            {JSON.stringify(value, null, 2)}
          </Code>
        </Box>
      </VStack>
    </Card>
  )
}

function ItemProjection({
  documentId,
  documentType,
  resourceName,
  projection,
}: {
  documentId: string
  documentType: string
  resourceName: string
  projection: string
}) {
  const {data: projectionData} = useDocumentProjection<Record<string, unknown>>({
    documentId,
    documentType,
    resourceName,
    projection,
  })

  return (
    <JsonBlock title="Projection Results:" testId="projection-results" value={projectionData} />
  )
}

function ItemPreview({
  documentId,
  documentType,
  resourceName,
}: {
  documentId: string
  documentType: string
  resourceName: string
}) {
  const {data: previewData, isPending} = useDocumentPreview({
    documentId,
    documentType,
    resourceName,
  })

  return (
    <JsonBlock
      title="Preview Results:"
      testId="preview-results"
      value={previewData}
      isPending={isPending}
    />
  )
}

export function ResourceDemoRoute({
  title,
  description,
  resourceName,
  documentType,
  initialQuery,
  projection,
  itemNoun,
  editor,
}: ResourceDemoRouteProps): JSX.Element {
  const [query] = useState(initialQuery)
  const [isLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const {data, isPending} = useQuery<SanityDocument[]>({
    query,
    resourceName,
  })

  const firstId =
    data && Array.isArray(data) && data.length > 0 && data[0]?._id ? data[0]._id : null

  return (
    <PageLayout title={title} subtitle="Query, project, and preview against this resource">
      <VStack gap={4}>
        <Text size={1} muted>
          {description}
        </Text>

        <Card density="regular">
          <VStack gap={2}>
            <Text muted size={1}>
              Current query:
            </Text>
            <Box padding={3}>
              <Code>{query}</Code>
            </Box>
          </VStack>
        </Card>

        <Card density="regular">
          <VStack gap={3}>
            <Flex alignItems="center" flexWrap="wrap" gap={2} justifyContent="space-between">
              <Flex alignItems="center" gap={2}>
                <Text size={1} weight="semibold">
                  useQuery Results:
                </Text>
                {(isPending || isLoading) && <Spinner />}
              </Flex>
              {firstId && (
                <Button
                  text={`Edit First ${itemNoun}`}
                  tone="primary"
                  fontSize={1}
                  onClick={() => setEditingId(firstId)}
                />
              )}
            </Flex>
            <Box overflow="auto" padding={3} style={{maxHeight: 400}}>
              <Code data-testid="query-results" language="json">
                {JSON.stringify(data, null, 2)}
              </Code>
            </Box>
          </VStack>
        </Card>

        {firstId && (
          <Grid gap={4} gridTemplateColumns={['1fr', '1fr', 'repeat(2, minmax(0, 1fr))']}>
            <Suspense
              fallback={
                <Card density="regular">
                  <Spinner />
                </Card>
              }
            >
              <ItemProjection
                documentId={firstId}
                documentType={documentType}
                resourceName={resourceName}
                projection={projection}
              />
            </Suspense>

            <Suspense
              fallback={
                <Card density="regular">
                  <Spinner />
                </Card>
              }
            >
              <ItemPreview
                documentId={firstId}
                documentType={documentType}
                resourceName={resourceName}
              />
            </Suspense>
          </Grid>
        )}

        {editingId && (
          <ItemEditorDialog
            itemNoun={itemNoun}
            documentId={editingId}
            documentType={documentType}
            resourceName={resourceName}
            editor={editor}
            open={!!editingId}
            onClose={() => setEditingId(null)}
          />
        )}
      </VStack>
    </PageLayout>
  )
}
