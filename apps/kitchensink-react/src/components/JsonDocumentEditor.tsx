import {
  type DocumentHandle,
  useDocument,
  useDocumentSyncStatus,
  useEditDocument,
} from '@sanity/sdk-react'
import {Badge} from '@sanity/ui'
import {type JsonData, JsonEditor} from 'json-edit-react'
import React from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {Box, Card, Text, VStack} from 'ui5'

interface JsonDocumentEditorProps {
  /** Document handle for the document being edited */
  documentHandle: Pick<DocumentHandle, 'documentId' | 'documentType' | 'perspective'>

  /** Optional minimum height (defaults to 400px) */
  minHeight?: string

  /** Optional maximum height for scrolling */
  maxHeight?: string

  /** Show sync status indicator (defaults to true) */
  showSyncStatus?: boolean

  /** Optional custom styles for the editor container */
  containerStyle?: React.CSSProperties

  /** Optional card wrapper (defaults to true) */
  wrapInCard?: boolean
}

function ErrorFallback({error}: {error: Error}) {
  return (
    <Card density="regular" tone="critical">
      <VStack gap={3}>
        <Text size={1} weight="semibold">
          Failed to load editor
        </Text>
        <Text size={1}>{error.message}</Text>
      </VStack>
    </Card>
  )
}

export function JsonDocumentEditor({
  documentHandle,
  minHeight = '400px',
  maxHeight,
  showSyncStatus = true,
  containerStyle,
  wrapInCard = true,
}: JsonDocumentEditorProps): React.JSX.Element {
  const {data: document} = useDocument(documentHandle)
  const editDocument = useEditDocument(documentHandle)
  const synced = useDocumentSyncStatus(documentHandle)

  const editorContent = (
    <VStack gap={3}>
      {showSyncStatus && (
        <Box>
          {synced ? (
            <Badge tone="positive">✓ Synced</Badge>
          ) : (
            <Badge tone="default">⟳ Syncing…</Badge>
          )}
        </Box>
      )}
      <Box
        style={{
          minHeight,
          maxHeight,
          overflow: maxHeight ? 'auto' : undefined,
          border: '1px solid var(--card-border-color)',
          borderRadius: '4px',
          padding: '16px',
          backgroundColor: 'var(--card-bg-color)',
          ...containerStyle,
        }}
      >
        <JsonEditor data={document || {}} setData={editDocument as (data: JsonData) => void} />
      </Box>
    </VStack>
  )

  const content = wrapInCard ? (
    <Card density="regular" style={{minHeight}}>
      {editorContent}
    </Card>
  ) : (
    editorContent
  )

  return (
    <ErrorBoundary
      fallbackRender={({error}) => <ErrorFallback error={error as unknown as Error} />}
    >
      {content}
    </ErrorBoundary>
  )
}
