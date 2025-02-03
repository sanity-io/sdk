import {publishDocument, unpublishDocument} from '@sanity/sdk'
import {useApplyActions, useDocument, useEditDocument} from '@sanity/sdk-react/hooks'
import {Box} from '@sanity/ui'
import {type JSX, Suspense, useRef} from 'react'

const documentId = 'db06bc9e-4608-465a-9551-a10cef478037'

function Editor() {
  const document = useDocument(documentId)
  const name = (useDocument(documentId, 'name') ?? '') as string
  const editName = useEditDocument(documentId, 'name')
  const apply = useApplyActions()

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target

    // Save the cursor position
    const cursorPosition = textarea.selectionStart

    // Update the state
    editName(textarea.value)

    // Restore the cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = cursorPosition
        textareaRef.current.selectionEnd = cursorPosition
      }
    }, 0)
  }

  return (
    <Box padding={4}>
      <label>
        Name:
        <textarea ref={textareaRef} rows={10} value={name} onChange={handleChange} />
      </label>
      <div>
        <button onClick={() => apply(publishDocument(documentId))}>publish</button>
        <button onClick={() => apply(unpublishDocument(documentId))}>unpublish</button>
      </div>
      <Box paddingY={5}>
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </Box>
    </Box>
  )
}

export function DocumentEditorRoute(): JSX.Element {
  return (
    <Suspense fallback={<>Loading</>}>
      <Editor />
    </Suspense>
  )
}
