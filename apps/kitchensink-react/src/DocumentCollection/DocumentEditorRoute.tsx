/* eslint-disable no-console */
import {
  createDocumentHandle,
  type DocumentHandle,
  useDocument,
  useDocumentEvent,
  useDocuments,
  useDocumentSyncStatus,
} from '@sanity/sdk-react'
import {Badge, Box, Button, Card, Checkbox, Flex, Label, Stack, Text, TextInput} from '@sanity/ui'
import {type JSX, useMemo, useState} from 'react'

import {DocumentEditorPanel} from '../components/DocumentEditorPanel'
import {JsonDocumentEditor} from '../components/JsonDocumentEditor'
import {devConfigs, e2eConfigs} from '../sanityConfigs'

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
    <Box padding={4}>
      <Stack space={4}>
        {/* Header Section */}
        <Card padding={3} radius={2} shadow={1}>
          <Flex gap={3} align="center" justify="space-between">
            <Flex gap={2} align="center">
              <Badge
                tone={docHandle.liveEdit ? 'primary' : 'default'}
                fontSize={2}
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
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={3}>
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
          </Stack>
        </Card>
      </Stack>
    </Box>
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
  const {projectId, dataset} = import.meta.env['VITE_IS_E2E'] ? e2eConfigs[0] : devConfigs[0]

  const docHandle = useMemo<DocumentHandle<'author'> | null>(
    () =>
      documentId
        ? createDocumentHandle({
            documentType: 'author',
            documentId,
            projectId,
            dataset,
            liveEdit: liveEditMode,
          })
        : null,
    [documentId, projectId, dataset, liveEditMode],
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
    <Box padding={4}>
      <Stack space={4}>
        {/* Load Document Section */}
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Text size={2} weight="semibold">
              Load Document
            </Text>
            <Flex gap={3} align="flex-end">
              <Box flex={1}>
                <TextInput
                  fontSize={2}
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
                fontSize={2}
                disabled={!newDocumentId && !docHandle?.documentId}
              />
            </Flex>
            <Card padding={3} tone="transparent" border>
              <Stack space={2}>
                <Flex gap={2} align="center">
                  <Checkbox
                    checked={liveEditMode}
                    onChange={(e) => setLiveEditMode(e.currentTarget.checked)}
                    data-testid="live-edit-checkbox"
                    id="live-edit-mode"
                  />
                  <Label htmlFor="live-edit-mode" size={1}>
                    Enable Live Edit Mode
                  </Label>
                </Flex>
                <Text size={1} muted>
                  {liveEditMode
                    ? '✓ Changes apply immediately (no drafts)'
                    : 'Drafts will be created for edits'}
                </Text>
              </Stack>
            </Card>
          </Stack>
        </Card>

        {/* Document Editor */}
        {!docHandle ? (
          <Card padding={4} radius={2} shadow={1} tone="transparent">
            <Text align="center" muted>
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
      </Stack>
    </Box>
  )
}

export function DocumentEditorRoute(): JSX.Element {
  return <Editor />
}
