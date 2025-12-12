/* eslint-disable no-console */
import {
  createDocument,
  createDocumentHandle,
  deleteDocument,
  discardDocument,
  type DocumentHandle,
  editDocument,
  publishDocument,
  unpublishDocument,
  useApplyDocumentActions,
  useDocument,
  useDocumentEvent,
  useDocumentPermissions,
  useDocuments,
  useDocumentSyncStatus,
  useEditDocument,
} from '@sanity/sdk-react'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Label,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@sanity/ui'
import {JsonData, JsonEditor} from 'json-edit-react'
import {type JSX, useEffect, useState} from 'react'

import {devConfigs, e2eConfigs} from '../sanityConfigs'

function DocumentEditor({docHandle}: {docHandle: DocumentHandle<'author'>}) {
  useDocumentEvent({...docHandle, onEvent: (e) => console.log(e)})
  const synced = useDocumentSyncStatus(docHandle)
  const apply = useApplyDocumentActions()

  const canEdit = useDocumentPermissions(editDocument(docHandle))
  const canCreate = useDocumentPermissions(createDocument(docHandle))
  const canPublish = useDocumentPermissions(publishDocument(docHandle))
  const canDelete = useDocumentPermissions(deleteDocument(docHandle))
  const canUnpublish = useDocumentPermissions(unpublishDocument(docHandle))
  const canDiscard = useDocumentPermissions(discardDocument(docHandle))

  const {data: name = ''} = useDocument({...docHandle, path: 'name'})
  const setName = useEditDocument({...docHandle, path: 'name'})

  const {data: document} = useDocument(docHandle)
  const setDocument = useEditDocument(docHandle)

  return (
    <Box padding={4}>
      <Stack space={4}>
        {/* Header Section */}
        <Card padding={3} radius={2} shadow={1}>
          <Flex gap={3} align="center" justify="space-between">
            <Flex gap={2} align="center">
              <Badge tone={docHandle.liveEdit ? 'primary' : 'default'} fontSize={2}>
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

        {/* Document Info Section */}
        <Card padding={3} radius={2} shadow={1}>
          <Stack space={3}>
            <Text size={1} weight="semibold">
              Document Information
            </Text>
            <Flex gap={3}>
              <Box flex={1}>
                <TextInput fontSize={1} label="Document ID" value={docHandle.documentId} readOnly />
              </Box>
              <Box flex={1}>
                <TextInput
                  fontSize={1}
                  label="Name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                  data-testid="name-input"
                />
              </Box>
            </Flex>
          </Stack>
        </Card>

        {/* Actions Section */}
        <Card padding={3} radius={2} shadow={1}>
          <Stack space={3}>
            <Text size={1} weight="semibold">
              Document Actions
            </Text>
            <Flex gap={2} wrap="wrap">
              <Tooltip content={canCreate.message}>
                <Box>
                  <Button
                    disabled={!canCreate.allowed}
                    onClick={() => apply(createDocument(docHandle))}
                    text="Create"
                    tone="positive"
                    fontSize={1}
                  />
                </Box>
              </Tooltip>

              {!docHandle.liveEdit && (
                <>
                  <Tooltip content={canPublish.message}>
                    <Box>
                      <Button
                        disabled={!canPublish.allowed}
                        onClick={async () => {
                          const response = await apply(publishDocument(docHandle))
                          await response.submitted()
                        }}
                        text="Publish"
                        tone="positive"
                        fontSize={1}
                      />
                    </Box>
                  </Tooltip>
                  <Tooltip content={canDiscard.message}>
                    <Box>
                      <Button
                        disabled={!canDiscard.allowed}
                        onClick={() => apply(discardDocument(docHandle))}
                        text="Discard Draft"
                        fontSize={1}
                      />
                    </Box>
                  </Tooltip>
                  <Tooltip content={canUnpublish.message}>
                    <Box>
                      <Button
                        disabled={!canUnpublish.allowed}
                        onClick={() => apply(unpublishDocument(docHandle))}
                        text="Unpublish"
                        fontSize={1}
                      />
                    </Box>
                  </Tooltip>
                </>
              )}

              <Tooltip content={canDelete.message}>
                <Box>
                  <Button
                    disabled={!canDelete.allowed}
                    onClick={() => apply(deleteDocument(docHandle))}
                    text="Delete"
                    tone="critical"
                    fontSize={1}
                  />
                </Box>
              </Tooltip>
            </Flex>
            {canEdit.message && (
              <Text size={1} muted>
                Permissions: {canEdit.message}
              </Text>
            )}
          </Stack>
        </Card>

        {/* JSON Editor Section */}
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={3}>
            <Text size={1} weight="semibold">
              Document Content
            </Text>
            {document && (
              <>
                {/* Hidden element for e2e tests */}
                <Box style={{display: 'none'}} data-testid="document-content">
                  {JSON.stringify(document)}
                </Box>
                <Box style={{minHeight: '400px'}}>
                  <JsonEditor data={document} setData={setDocument as (data: JsonData) => void} />
                </Box>
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

  const [docHandle, setDocHandle] = useState<DocumentHandle<'author'> | null>(documents[0] ?? null)
  const [newDocumentId, setNewDocumentId] = useState<string>('')
  const [liveEditMode, setLiveEditMode] = useState<boolean>(false)
  const {projectId, dataset} = import.meta.env['VITE_IS_E2E'] ? e2eConfigs[0] : devConfigs[0]

  const handleLoadDocument = () => {
    const documentId = newDocumentId || docHandle?.documentId
    if (documentId) {
      setDocHandle(
        createDocumentHandle({
          documentType: 'author',
          documentId,
          projectId,
          dataset,
          liveEdit: liveEditMode,
        }),
      )
    }
  }

  const updateDocHandle = (newValue: string) => {
    setNewDocumentId(newValue)
  }

  // Automatically reload document when liveEdit mode is toggled
  useEffect(() => {
    if (docHandle) {
      setDocHandle(
        createDocumentHandle({
          documentType: 'author',
          documentId: docHandle.documentId,
          projectId,
          dataset,
          liveEdit: liveEditMode,
        }),
      )
    }
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEditMode])

  if (!documents.length) {
    return <Box padding={4}>No documents found</Box>
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
          />
        )}
      </Stack>
    </Box>
  )
}

export function DocumentEditorRoute(): JSX.Element {
  return <Editor />
}
