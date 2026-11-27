import {
  createDocument,
  discardDocument,
  publishDocument,
  useApplyDocumentActions,
  useDocument,
  useDocuments,
  useDocumentSyncStatus,
  useEditDocument,
  useSanityInstance,
} from '@sanity/sdk-react'
import {type JSX, Suspense, useState} from 'react'
import {Box, Card, Spinner, Text, VStack} from 'ui5'

import {PageLayout} from '../components/PageLayout'

// Prototype check for `experimental_documentSync`: edits an author's name through the SDK's
// normal hooks. Load with `?documentSync` to route the edits through the document-sync engine.

function AuthorName({documentId}: {documentId: string}): JSX.Element {
  const handle = {documentId, documentType: 'author'}
  const {data: name} = useDocument({...handle, path: 'name'})
  const {data: rev} = useDocument({...handle, path: '_rev'})
  const editName = useEditDocument({...handle, path: 'name'})
  const inSync = useDocumentSyncStatus(handle)
  const apply = useApplyDocumentActions()
  return (
    <Card density="compact">
      <VStack gap={2}>
        <label htmlFor="engine-name">
          <Text size={1} weight="semibold">
            name
          </Text>
        </label>
        <input
          id="engine-name"
          value={String(name ?? '')}
          onChange={(event) => void editName(event.target.value)}
          style={{font: 'inherit', padding: 6}}
        />
        <Text size={1}>_rev: {String(rev ?? '(none)')}</Text>
        <Text size={1}>in sync: {String(inSync)}</Text>
        <Box>
          <button type="button" onClick={() => void apply(publishDocument(handle))}>
            Publish
          </button>{' '}
          <button type="button" onClick={() => void apply(discardDocument(handle))}>
            Discard draft
          </button>
        </Box>
      </VStack>
    </Card>
  )
}

function Picker(): JSX.Element {
  const {data} = useDocuments({documentType: 'author', batchSize: 20})
  const [documentId, setDocumentId] = useState<string | undefined>()
  const selected = documentId ?? data[0]?.documentId
  const apply = useApplyDocumentActions()
  // A throwaway author for trying publish and discard without touching real content.
  const createTestAuthor = () => {
    const id = `engine-test-${Math.random().toString(36).slice(2, 8)}`
    void apply(createDocument({documentId: id, documentType: 'author'}))
    setDocumentId(id)
  }
  return (
    <VStack gap={3}>
      <Box>
        <label htmlFor="engine-document">
          <Text size={1}>Author document </Text>
        </label>
        <select
          id="engine-document"
          value={selected}
          onChange={(event) => setDocumentId(event.target.value)}
        >
          {data.map((doc) => (
            <option key={doc.documentId} value={doc.documentId}>
              {doc.documentId}
            </option>
          ))}
        </select>{' '}
        <button type="button" onClick={createTestAuthor}>
          Create test author
        </button>
      </Box>
      {selected ? (
        <Suspense fallback={<Spinner />}>
          <AuthorName key={selected} documentId={selected} />
        </Suspense>
      ) : null}
    </VStack>
  )
}

export function DocumentStoreEngineRoute(): JSX.Element {
  const instance = useSanityInstance()
  return (
    <PageLayout
      title="Document store engine"
      subtitle={`experimental_documentSync: ${String(!!instance.config.experimental_documentSync)}`}
    >
      <Suspense fallback={<Spinner />}>
        <Picker />
      </Suspense>
    </PageLayout>
  )
}
