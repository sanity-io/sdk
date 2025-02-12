/* eslint-disable no-console */
import {deleteDocument, DocumentHandle, publishDocument, unpublishDocument} from '@sanity/sdk'
import {
  useApplyActions,
  useDocument,
  useDocumentEvent,
  useDocumentSyncStatus,
  useEditDocument,
} from '@sanity/sdk-react/hooks'
import {SanityDocument} from '@sanity/types'
import {Box, Button} from '@sanity/ui'
import {type JSX, Suspense} from 'react'

interface Author extends SanityDocument {
  _type: 'author'
  name?: string
}

const doc: DocumentHandle<Author> = {_id: 'db06bc9e-4608-465a-9551-a10cef478037', _type: 'author'}

function Editor() {
  const document = useDocument(doc)
  const name = useDocument(doc, 'name') ?? ''
  const editName = useEditDocument(doc, 'name')
  const apply = useApplyActions()

  useDocumentEvent((e) => console.log(e))
  const synced = useDocumentSyncStatus(doc)

  return (
    <Box padding={4}>
      <label>
        Name:
        <textarea value={name} onChange={(e) => editName(e.currentTarget.value)} />
      </label>

      <div>
        <Button
          onClick={async () => {
            const response = await apply(publishDocument(doc))
            await response.submitted()
          }}
          text="Publish"
        />
        <Button onClick={() => apply(unpublishDocument(doc))} text="Unpublish" />
        <Button onClick={() => apply(deleteDocument(doc))} text="Delete" />

        <div>{synced ? 'Synced' : 'Syncing…'}</div>
      </div>
      <Box paddingY={5}>
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </Box>
    </Box>
  )
}

export function DocumentEditorRoute(): JSX.Element {
  return (
    <Suspense fallback={<>Loading Editor… (Suspense)</>}>
      <Editor />
    </Suspense>
  )
}
