/* eslint-disable no-console */
import {
  createDocument,
  deleteDocument,
  discardDocument,
  DocumentHandle,
  editDocument,
  publishDocument,
  unpublishDocument,
} from '@sanity/sdk'
import {
  useApplyActions,
  useDocument,
  useDocumentEvent,
  useDocumentSyncStatus,
  useEditDocument,
  usePermissions,
} from '@sanity/sdk-react'
import {SanityDocument} from '@sanity/types'
import {Box, Button, TextInput, Tooltip} from '@sanity/ui'
import {JsonData, JsonEditor} from 'json-edit-react'
import {type JSX, useState} from 'react'

interface Author extends SanityDocument {
  _type: 'author'
  name?: string
}

const docHandle: DocumentHandle<Author> = {
  documentType: 'author',
  documentId: 'db06bc9e-4608-465a-9551-a10cef478037',
  projectId: 'ppsg7ml5',
  dataset: 'test',
}

function Editor() {
  useDocumentEvent((e) => console.log(e), docHandle)
  const synced = useDocumentSyncStatus(docHandle)
  const apply = useApplyActions()

  const canEdit = usePermissions(editDocument(docHandle))
  const canCreate = usePermissions(createDocument(docHandle))
  const canPublish = usePermissions(publishDocument(docHandle))
  const canDelete = usePermissions(deleteDocument(docHandle))
  const canUnpublish = usePermissions(unpublishDocument(docHandle))
  const canDiscard = usePermissions(discardDocument(docHandle))

  const name = useDocument(docHandle, 'name') ?? ''
  const setName = useEditDocument(docHandle, 'name')

  const [value, setValue] = useState('')

  const document = useDocument(docHandle)
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

export function DocumentEditorRoute(): JSX.Element {
  return <Editor />
}
