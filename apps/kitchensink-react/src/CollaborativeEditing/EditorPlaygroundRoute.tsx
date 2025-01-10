import {at, mutate as coreMutate, getDocumentState, Mutation, patch, set} from '@sanity/sdk'
import {useSanityInstance} from '@sanity/sdk-react/hooks'
import {Box, Heading, TextInput} from '@sanity/ui'
import {useCallback, useState, useSyncExternalStore} from 'react'

function useDocument(documentId: string) {
  const instance = useSanityInstance()

  const [documentState] = useState(() =>
    getDocumentState(instance, {
      document: {_id: documentId, _type: 'author'},
    }),
  )
  return useSyncExternalStore(documentState.subscribe, documentState.getCurrent)
}

function useMutate() {
  const instance = useSanityInstance()
  return useCallback((mutation: Mutation[]) => coreMutate(instance, mutation), [instance])
}

export function EditorPlaygroundRoute(): JSX.Element {
  const documentId = 'drafts.58f9a4b2-0c8e-4d74-ab7b-15e38d93c784'

  const mutate = useMutate()
  const document = useDocument(documentId)

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Editor Playground
      </Heading>
      <TextInput
        label="Name"
        value={(document?.name as string) ?? ''}
        onChange={(e) => {
          const {value} = e.currentTarget
          mutate([patch(documentId, [at('name', set(value))])])
        }}
      />
      <Box paddingY={5}>
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </Box>
    </Box>
  )
}
