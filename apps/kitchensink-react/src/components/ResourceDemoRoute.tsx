import {
  useDocumentPreview,
  useDocumentProjection,
  useDocumentSyncStatus,
  useQuery,
} from '@sanity/sdk-react'
import {Box, Button, Card, Dialog, Flex, Grid, Spinner, Stack, Text} from '@sanity/ui'
import {Code} from '@sanity/ui/code'
import {type JSX, type ReactNode, Suspense, useState} from 'react'
import {type SanityDocument} from 'sanity'

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
          <Stack gap={4}>
            <DocumentEditorPanel
              docHandle={docHandle}
              nameField={editor.nameField}
              nameLabel={editor.nameLabel}
            />
            <JsonDocumentEditor documentHandle={docHandle} minHeight="500px" maxHeight="70vh" />
          </Stack>
        </Suspense>
        <Flex justify="flex-end" gap={2} marginTop={4}>
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
    <Card padding={4} radius={2} shadow={1}>
      <Stack gap={3}>
        <Flex align="center" gap={2}>
          <Text size={1} weight="semibold">
            {title}
          </Text>
          {isPending && <Spinner />}
        </Flex>
        <Card overflow="auto" padding={3} radius={2} style={{maxHeight: 400}} tone="transparent">
          <Code data-testid={testId} language="json">
            {JSON.stringify(value, null, 2)}
          </Code>
        </Card>
      </Stack>
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
      <Stack gap={4}>
        <Text size={1} muted>
          {description}
        </Text>

        <Card padding={4} radius={2} shadow={1}>
          <Stack gap={2}>
            <Text muted size={1}>
              Current query:
            </Text>
            <Card padding={3} radius={2} tone="transparent">
              <Code>{query}</Code>
            </Card>
          </Stack>
        </Card>

        <Card padding={4} radius={2} shadow={1}>
          <Stack gap={3}>
            <Flex align="center" justify="space-between" wrap="wrap" gap={2}>
              <Flex align="center" gap={2}>
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
            <Card
              overflow="auto"
              padding={3}
              radius={2}
              style={{maxHeight: 400}}
              tone="transparent"
            >
              <Code data-testid="query-results" language="json">
                {JSON.stringify(data, null, 2)}
              </Code>
            </Card>
          </Stack>
        </Card>

        {firstId && (
          <Grid gap={4} gridTemplateColumns={[1, 1, 2]}>
            <Suspense
              fallback={
                <Card padding={4} radius={2} shadow={1}>
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
                <Card padding={4} radius={2} shadow={1}>
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
      </Stack>
    </PageLayout>
  )
}
