/* eslint-disable no-console */
import {
  createDocumentHandle,
  type DocumentHandle,
  useDocument,
  useDocumentEvent,
  useDocuments,
  useDocumentSyncStatus,
  useResource,
} from '@sanity/sdk-react'
import {Badge, Button, Checkbox, TextInput} from '@sanity/ui'
import {type JSX, useMemo, useState} from 'react'
import {Box, Card, Flex, Text, VStack} from 'ui5'

import {DocumentEditorPanel} from '../components/DocumentEditorPanel'
import {JsonDocumentEditor} from '../components/JsonDocumentEditor'
import {PageLayout} from '../components/PageLayout'

const AUTHOR_INITIAL_VALUES = {
  name: 'New Author',
  role: 'developer',
  awards: ['Quick Creator Award'],
}

function DocumentEditor({
  docHandle,
  onDocumentIdChange,
}: {
  docHandle: DocumentHandle<'author'>
  onDocumentIdChange: (id: string) => void
}) {
  useDocumentEvent({...docHandle, onEvent: (e) => console.log(e)})
  const synced = useDocumentSyncStatus(docHandle)

  const {data: document} = useDocument(docHandle)

  return (
    <VStack gap={4}>
      <Card density="compact">
        <Flex alignItems="center" gap={3} justifyContent="space-between">
          <Flex alignItems="center" gap={2}>
            <Badge
              tone={docHandle.liveEdit ? 'primary' : 'default'}
              fontSize={1}
              data-testid="live-edit-mode-badge"
            >
              {docHandle.liveEdit ? 'Live Edit Mode' : 'Draft/Published Mode'}
            </Badge>
            {docHandle.liveEdit && (
              <Badge tone="caution" fontSize={1}>
                No drafts • Changes apply immediately
              </Badge>
            )}
          </Flex>
          <Badge tone={synced ? 'positive' : 'default'} fontSize={1}>
            {synced ? '✓ Synced' : '⟳ Syncing…'}
          </Badge>
        </Flex>
      </Card>

      <DocumentEditorPanel
        docHandle={docHandle}
        createInitialValues={AUTHOR_INITIAL_VALUES}
        onDocumentIdChange={onDocumentIdChange}
      />

      {/* JSON Editor Section */}
      <Card density="regular">
        <VStack gap={3}>
          <Text size={1} weight="semibold">
            Document Content
          </Text>
          {document && (
            <>
              {/* Hidden element for e2e tests */}
              <Box
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  left: -9999,
                }}
                data-testid="document-content"
              >
                {JSON.stringify(document)}
              </Box>
              <JsonDocumentEditor
                documentHandle={docHandle}
                minHeight="400px"
                wrapInCard={false}
                showSyncStatus={false}
              />
            </>
          )}
        </VStack>
      </Card>
    </VStack>
  )
}

function Editor() {
  const {data: documents} = useDocuments({
    documentType: 'author',
    batchSize: 1,
  })

  const [documentId, setDocumentId] = useState<string | null>(documents[0]?.documentId ?? null)
  const [newDocumentId, setNewDocumentId] = useState<string>('')
  const [liveEditMode, setLiveEditMode] = useState<boolean>(false)
  const resource = useResource()

  const docHandle = useMemo<DocumentHandle<'author'> | null>(
    () =>
      documentId
        ? createDocumentHandle({
            documentType: 'author',
            documentId,
            resource,
            liveEdit: liveEditMode,
          })
        : null,
    [documentId, resource, liveEditMode],
  )

  const handleLoadDocument = () => {
    const idToLoad = newDocumentId || documentId
    if (idToLoad) {
      setDocumentId(idToLoad)
    }
  }

  const handleDocumentIdChange = (newId: string) => {
    setDocumentId(newId)
  }

  const updateDocHandle = (newValue: string) => {
    setNewDocumentId(newValue)
  }

  return (
    <PageLayout title="Document editor" subtitle="Load an author, then edit, publish, or delete it">
      <VStack gap={4}>
        <Card density="regular">
          <VStack gap={4}>
            <Text size={1} weight="semibold">
              Load Document
            </Text>
            <Flex alignItems="flex-end" gap={3}>
              <Box flexGrow={1}>
                <TextInput
                  fontSize={1}
                  label="Document ID"
                  type="text"
                  value={newDocumentId || docHandle?.documentId || ''}
                  placeholder="Enter document ID"
                  data-testid="document-id-input"
                  onChange={(e) => updateDocHandle(e.currentTarget.value)}
                />
              </Box>
              <Button
                text="Load Document"
                onClick={() => handleLoadDocument()}
                data-testid="load-document-button"
                tone="primary"
                fontSize={1}
                disabled={!newDocumentId && !docHandle?.documentId}
              />
            </Flex>
            <Box border padding={3}>
              <VStack gap={2}>
                <Flex alignItems="center" gap={2}>
                  <Checkbox
                    checked={liveEditMode}
                    onChange={(e) => setLiveEditMode(e.currentTarget.checked)}
                    data-testid="live-edit-checkbox"
                    id="live-edit-mode"
                  />
                  <Text as="label" htmlFor="live-edit-mode" size={1}>
                    Enable Live Edit Mode
                  </Text>
                </Flex>
                <Text size={1} muted>
                  {liveEditMode
                    ? '✓ Changes apply immediately (no drafts)'
                    : 'Drafts will be created for edits'}
                </Text>
              </VStack>
            </Box>
          </VStack>
        </Card>

        {!docHandle ? (
          <Card density="regular">
            <Text align="center" muted size={1}>
              Enter a document ID above to get started
            </Text>
          </Card>
        ) : (
          <DocumentEditor
            key={`${docHandle.documentId}-${docHandle.liveEdit}`}
            docHandle={docHandle}
            onDocumentIdChange={handleDocumentIdChange}
          />
        )}
      </VStack>
    </PageLayout>
  )
}

export function DocumentEditorRoute(): JSX.Element {
  return <Editor />
}
