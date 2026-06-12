import {
  useDocumentPreview,
  useDocumentProjection,
  useDocumentSyncStatus,
  useQuery,
} from '@sanity/sdk-react'
import {Box, Button, Card, Dialog, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {type JSX, type ReactNode, Suspense, useState} from 'react'
import {type SanityDocument} from 'sanity'

import {DocumentEditorPanel} from './DocumentEditorPanel'
import {JsonDocumentEditor} from './JsonDocumentEditor'

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
          <Stack space={4}>
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
    <Card padding={3} style={{backgroundColor: '#1a1a1a'}}>
      <div style={{display: 'flex', alignItems: 'center', marginBottom: '1rem'}}>
        <Text size={1} weight="medium" style={{color: '#fff'}}>
          Projection Results:
        </Text>
      </div>

      <pre
        data-testid="projection-results"
        style={{
          backgroundColor: '#2a2a2a',
          padding: '1rem',
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '400px',
          fontSize: '0.875rem',
          color: '#fff',
          whiteSpace: 'pre-wrap',
        }}
      >
        {JSON.stringify(projectionData, null, 2)}
      </pre>
    </Card>
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
    <Card padding={3} style={{backgroundColor: '#1a1a1a'}}>
      <div style={{display: 'flex', alignItems: 'center', marginBottom: '1rem'}}>
        <Text size={1} weight="medium" style={{color: '#fff'}}>
          Preview Results:
        </Text>
        {isPending && <Spinner style={{marginLeft: '0.5rem'}} />}
      </div>

      <pre
        data-testid="preview-results"
        style={{
          backgroundColor: '#2a2a2a',
          padding: '1rem',
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '400px',
          fontSize: '0.875rem',
          color: '#fff',
          whiteSpace: 'pre-wrap',
        }}
      >
        {JSON.stringify(previewData, null, 2)}
      </pre>
    </Card>
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
    <div style={{padding: '2rem', maxWidth: '1200px', margin: '0 auto'}}>
      <Text size={4} weight="bold" style={{marginBottom: '2rem', color: 'white'}}>
        {title}
      </Text>

      <Text size={2} style={{marginBottom: '2rem'}}>
        {description}
      </Text>

      <Card padding={3} style={{marginBottom: '2rem', backgroundColor: '#1a1a1a'}}>
        <div style={{marginBottom: '1rem'}}>
          <Text size={1} style={{color: '#ccc', marginBottom: '0.5rem'}}>
            Current query:
          </Text>
          <code
            style={{
              display: 'block',
              padding: '0.5rem',
              backgroundColor: '#2a2a2a',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: '#fff',
              wordBreak: 'break-all',
            }}
          >
            {query}
          </code>
        </div>
      </Card>

      <Card padding={3} style={{marginBottom: '2rem', backgroundColor: '#1a1a1a'}}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center'}}>
            <Text size={1} weight="medium" style={{color: '#fff'}}>
              useQuery Results:
            </Text>
            {(isPending || isLoading) && <Spinner style={{marginLeft: '0.5rem'}} />}
          </div>
          {firstId && (
            <Button
              text={`Edit First ${itemNoun}`}
              tone="primary"
              fontSize={1}
              onClick={() => setEditingId(firstId)}
            />
          )}
        </div>

        <pre
          data-testid="query-results"
          style={{
            backgroundColor: '#2a2a2a',
            padding: '1rem',
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '400px',
            fontSize: '0.875rem',
            color: '#fff',
            whiteSpace: 'pre-wrap',
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      </Card>

      {firstId && (
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
          <Suspense
            fallback={
              <Card padding={3} style={{backgroundColor: '#1a1a1a'}}>
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
              <Card padding={3} style={{backgroundColor: '#1a1a1a'}}>
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
        </div>
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
    </div>
  )
}
