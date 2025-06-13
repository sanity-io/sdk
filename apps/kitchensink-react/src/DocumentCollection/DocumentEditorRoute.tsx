/* eslint-disable no-console */
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
  useDocumentEvent,
  useDocumentPermissions,
  useDocuments,
  useDocumentSyncStatus,
  useEditDocument,
} from '@sanity/sdk-react'
import {Box, Button, TextInput, Tooltip} from '@sanity/ui'
import {JsonData, JsonEditor} from 'json-edit-react'
import {type JSX, useState} from 'react'

function DocumentEditor({docHandle}: {docHandle: DocumentHandle<'author'>}) {
  const [value, setValue] = useState('')

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
          label="Value"
          type="text"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
        <TextInput
          label="Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </Box>
    </Box>
  )
}

function Editor() {
  const {data: documents} = useDocuments({
    documentType: 'author',
    batchSize: 1,
  })

  const docHandle = documents[0] ?? null

  if (!docHandle) {
    return <Box padding={4}>No documents found</Box>
  }

  if (!docHandle) {
    return <Box padding={4}>Loading...</Box>
  }

  return <DocumentEditor docHandle={docHandle} />
}

export function DocumentEditorRoute(): JSX.Element {
  return <Editor />
}
