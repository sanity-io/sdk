import {at, createIfNotExists, createSanityInstance, patch, set} from '@sanity/sdk'
import {AuthBoundary, SanityProvider} from '@sanity/sdk-react/components'
import {useDocument, useMutate} from '@sanity/sdk-react/hooks'
import {SanityDocument} from '@sanity/types'
import {Suspense} from 'react'

const documentId = 'sdk-test-author'
const draftId = `drafts.${documentId}`
const sanityInstance = createSanityInstance({
  projectId: 'ppsg7ml5',
  dataset: 'test',
})

interface Author extends SanityDocument {
  name?: string
}

function Editor() {
  // `useDocument` suspends until the document has been populated in the store
  const document = useDocument<Author>(draftId)
  const name = useDocument(draftId, (doc: Author | null) => doc?.name)
  const mutate = useMutate()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    mutate([
      createIfNotExists({_id: draftId, _type: 'author'}),
      patch(draftId, [at('name', set(e.currentTarget.value))]),
    ])

  return (
    <>
      <label>
        Input: <input value={name ?? ''} onChange={handleChange} />
      </label>

      <div>
        Full document:
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </div>
    </>
  )
}

export function EditorPlaygroundRoute(): React.ReactElement {
  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <Suspense fallback={<>Loading…</>}>
        <AuthBoundary>
          <Editor />
        </AuthBoundary>
      </Suspense>
    </SanityProvider>
  )
}
