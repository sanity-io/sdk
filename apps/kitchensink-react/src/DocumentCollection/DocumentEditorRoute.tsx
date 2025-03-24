/* eslint-disable no-console */
import {at, patch, set} from '@sanity/mutate'
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
  useApplyDocumentActions,
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

const doc: DocumentHandle<Author> = {
  _type: 'author',
  _id: 'db06bc9e-4608-465a-9551-a10cef478037',
  resourceId: 'document:ppsg7ml5.test:db06bc9e-4608-465a-9551-a10cef478037',
}

function Editor() {
  useDocumentEvent((e) => console.log(e), doc)
  const synced = useDocumentSyncStatus(doc)
  const apply = useApplyDocumentActions()

  const canEdit = usePermissions(editDocument(doc))
  const canCreate = usePermissions(createDocument(doc))
  const canPublish = usePermissions(publishDocument(doc))
  const canDelete = usePermissions(deleteDocument(doc))
  const canUnpublish = usePermissions(unpublishDocument(doc))
  const canDiscard = usePermissions(discardDocument(doc))

  const name = useDocument(doc, 'name') ?? ''
  const setName = useEditDocument(doc, 'name')

  const [value, setValue] = useState('')

  const changeNameToValue = editDocument(patch(doc._id, at('name', set(value))))
  const canChangeNameToValue = usePermissions(changeNameToValue)

  const document = useDocument(doc)
  const setDocument = useEditDocument(doc)

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
              onClick={() => apply(createDocument(doc))}
              text="Create"
            />
          </span>
        </Tooltip>
        <Tooltip content={canDiscard.message}>
          <span>
            <Button
              disabled={!canDiscard.allowed}
              onClick={() => apply(discardDocument(doc))}
              text="Discard"
            />
          </span>
        </Tooltip>
        <Tooltip content={canPublish.message}>
          <span>
            <Button
              disabled={!canPublish.allowed}
              onClick={async () => {
                const response = await apply(publishDocument(doc))
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
              onClick={() => apply(unpublishDocument(doc))}
              text="Unpublish"
            />
          </span>
        </Tooltip>
        <Tooltip content={canDelete.message}>
          <span>
            <Button
              disabled={!canDelete.allowed}
              onClick={() => apply(deleteDocument(doc))}
              text="Delete"
            />
          </span>
        </Tooltip>
        <Tooltip content={canChangeNameToValue.message}>
          <span>
            <Button
              disabled={!canChangeNameToValue.allowed}
              onClick={() => apply(changeNameToValue)}
              text="Change name to value"
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
