import {
  createDocument,
  deleteDocument,
  discardDocument,
  type DocumentHandle,
  editDocument,
  publishDocument,
  unpublishDocument,
  useApplyDocumentActions,
  useDocument,
  useDocumentPermissions,
  useEditDocument,
  useResource,
} from '@sanity/sdk-react'
import {Box, Button, Card, Flex, Stack, Text, TextInput, Tooltip} from '@sanity/ui'
import React, {useEffect, useState} from 'react'

interface DocumentEditorPanelProps {
  docHandle: DocumentHandle
  /**
   * The document field path to use for the editable text input.
   * Defaults to 'name'.
   */
  nameField?: string
  /**
   * The label shown above the editable text input.
   * Defaults to 'Name'.
   */
  nameLabel?: string
  /**
   * If provided, shows a "Create with Initial Values" button pre-populated with these values.
   * If omitted, that button is hidden.
   */
  createInitialValues?: Record<string, unknown>
  /**
   * If provided, the Document ID input becomes editable. Called when the user commits
   * a new ID (on blur or Enter). The parent is responsible for updating docHandle.
   */
  onDocumentIdChange?: (id: string) => void
}

/*
 * This component is used to test document actions and single-field "real-time" edits
 */
export function DocumentEditorPanel({
  docHandle,
  nameField = 'name',
  nameLabel = 'Name',
  createInitialValues,
  onDocumentIdChange,
}: DocumentEditorPanelProps): React.JSX.Element {
  const apply = useApplyDocumentActions()

  // document actions (editDocument, createDocument, publishDocument, etc.) come from core and require resource to be passed in
  const resource = useResource()!
  const strictHandle = {...docHandle, resource}

  const canEdit = useDocumentPermissions(editDocument(strictHandle))
  const canCreate = useDocumentPermissions(createDocument(strictHandle))
  const canPublish = useDocumentPermissions(publishDocument(strictHandle))
  const canDelete = useDocumentPermissions(deleteDocument(strictHandle))
  const canUnpublish = useDocumentPermissions(unpublishDocument(strictHandle))
  const canDiscard = useDocumentPermissions(discardDocument(strictHandle))
  const [inputId, setInputId] = useState(docHandle.documentId)

  useEffect(() => {
    setInputId(docHandle.documentId)
  }, [docHandle.documentId])

  const commitId = () => {
    if (inputId !== docHandle.documentId) {
      onDocumentIdChange?.(inputId)
    }
  }
  const {data} = useDocument<string>({...docHandle, path: nameField})
  const setName = useEditDocument<string>({...docHandle, path: nameField})

  return (
    <Stack space={4}>
      {/* Document Info Section */}
      <Card padding={3} radius={2} shadow={1}>
        <Stack space={3}>
          <Text size={1} weight="semibold">
            Document Information
          </Text>
          <Flex gap={3}>
            <Box flex={1}>
              <TextInput
                fontSize={1}
                label="Document ID"
                value={inputId}
                readOnly={!onDocumentIdChange}
                onChange={(e) => setInputId(e.currentTarget.value)}
                onBlur={commitId}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitId()
                }}
              />
            </Box>
            <Box flex={1}>
              <TextInput
                fontSize={1}
                label={nameLabel}
                type="text"
                value={data ?? ''}
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
                  onClick={() => apply(createDocument(strictHandle))}
                  text="Create"
                  tone="positive"
                  fontSize={1}
                  data-testid="document-editor-action-create"
                />
              </Box>
            </Tooltip>

            {createInitialValues && (
              <Tooltip content={canCreate.message}>
                <Box>
                  <Button
                    disabled={!canCreate.allowed}
                    onClick={() => apply(createDocument(strictHandle, createInitialValues))}
                    text="Create with Initial Values"
                    tone="positive"
                    fontSize={1}
                  />
                </Box>
              </Tooltip>
            )}

            {!docHandle.liveEdit && (
              <>
                <Tooltip content={canPublish.message}>
                  <Box>
                    <Button
                      disabled={!canPublish.allowed}
                      onClick={async () => {
                        const response = await apply(publishDocument(strictHandle))
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
                      onClick={() => apply(discardDocument(strictHandle))}
                      text="Discard Draft"
                      fontSize={1}
                    />
                  </Box>
                </Tooltip>
                <Tooltip content={canUnpublish.message}>
                  <Box>
                    <Button
                      disabled={!canUnpublish.allowed}
                      onClick={() => apply(unpublishDocument(strictHandle))}
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
                  onClick={() => apply(deleteDocument(strictHandle))}
                  text="Delete"
                  tone="critical"
                  fontSize={1}
                  data-testid="document-editor-action-delete"
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
    </Stack>
  )
}
