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
import {Box, Button, TextInput, Tooltip} from '@sanity/ui'
import {JsonData, JsonEditor} from 'json-edit-react'
import {type JSX, useState} from 'react'

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
      {document && <JsonEditor data={document} setData={setDocument as (data: JsonData) => void} />}

      <div>
        <Tooltip content={canEdit.message}>
          <span>Edit permissions</span>
        </Tooltip>

        <Tooltip content={canCreate.message}>
          <span>
            <Button
              disabled={!canCreate.allowed}
              onClick={() => apply(createDocument(docHandle))}
              text="Create"
            />
          </span>
        </Tooltip>
        <Tooltip content={canCreate.message}>
          <span>
            <Button
              disabled={!canCreate.allowed}
              onClick={() =>
                apply(
                  createDocument(docHandle, {
                    name: 'New Author',
                    role: 'developer',
                    awards: ['Quick Creator Award'],
                  }),
                )
              }
              text="Create with Initial Values"
            />
          </span>
        </Tooltip>
        <Tooltip content={canDiscard.message}>
          <span>
            <Button
              disabled={!canDiscard.allowed}
              onClick={() => apply(discardDocument(docHandle))}
              text="Discard"
            />
          </span>
        </Tooltip>
        <Tooltip content={canPublish.message}>
          <span>
            <Button
              disabled={!canPublish.allowed}
              onClick={async () => {
                const response = await apply(publishDocument(docHandle))
                await response.submitted()
              }}
              text="Publish"
            />
          </span>
        </Tooltip>
        <Tooltip content={canUnpublish.message}>
          <span>
            <Button
              disabled={!canUnpublish.allowed}
              onClick={() => apply(unpublishDocument(docHandle))}
              text="Unpublish"
            />
          </span>
        </Tooltip>
        <Tooltip content={canDelete.message}>
          <span>
            <Button
              disabled={!canDelete.allowed}
              onClick={() => apply(deleteDocument(docHandle))}
              text="Delete"
            />
          </span>
        </Tooltip>

        <div>{synced ? 'Synced' : 'Syncing…'}</div>
      </div>

      <Box paddingY={5}>
        <TextInput
          label="Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-testid="name-input"
        />
        <pre data-testid="document-content">{JSON.stringify(document, null, 2)}</pre>
      </Box>
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
  const {projectId, dataset} = import.meta.env['VITE_IS_E2E'] ? e2eConfigs[0] : devConfigs[0]

  const handleLoadDocument = () => {
    if (newDocumentId) {
      setDocHandle(
        createDocumentHandle({
          documentType: 'author',
          documentId: newDocumentId,
          projectId,
          dataset,
        }),
      )
    }
  }

  const updateDocHandle = (newValue: string) => {
    setNewDocumentId(newValue)
  }

  if (!documents.length) {
    return <Box padding={4}>No documents found</Box>
  }

  return (
    <Box padding={4}>
      <Box paddingY={4}>
        <Box style={{display: 'flex', gap: '8px', alignItems: 'flex-end'}}>
          <Box style={{flex: 1}}>
            <TextInput
              label="Document ID"
              type="text"
              value={newDocumentId || docHandle?.documentId || ''}
              placeholder="Enter document ID"
              data-testid="document-id-input"
              onChange={(e) => updateDocHandle(e.currentTarget.value)}
            />
          </Box>
          <Button
            text="Load"
            onClick={() => handleLoadDocument()}
            data-testid="load-document-button"
          />
        </Box>
      </Box>
      {!docHandle ? <Box padding={4}>Loading...</Box> : <DocumentEditor docHandle={docHandle} />}
    </Box>
  )
}

export function DocumentEditorRoute(): JSX.Element {
  return <Editor />
}
