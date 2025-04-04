import {
  type EditorConfig,
  EditorProvider,
  type PortableTextBlock,
  useEditor,
} from '@portabletext/editor'
import {type DocumentHandle, getDocumentState, type SanityDocument} from '@sanity/sdk'
import {useEffect, useState} from 'react'

import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {useEditDocument} from '../hooks/document/useEditDocument'

function UpdateValuePlugin({path, ...docHandle}: DocumentHandle & {path: string}) {
  const instance = useSanityInstance(docHandle)
  const editor = useEditor()
  const edit = useEditDocument(docHandle, path)

  useEffect(() => {
    const {getCurrent, subscribe} = getDocumentState<
      SanityDocument & Record<string, PortableTextBlock[] | undefined>,
      string
    >(instance, docHandle, path)

    subscribe(() => {
      editor.send({type: 'update value', value: getCurrent()})
    })
  }, [docHandle, editor, instance, path])

  useEffect(() => {
    const subscription = editor.on('mutation', ({value}) => edit(value))
    return () => subscription.unsubscribe()
  }, [edit, editor])

  return null
}

/**
 * @alpha
 */
export interface PortableTextEditorProviderProps extends DocumentHandle {
  path: string
  initialConfig: EditorConfig
  children: React.ReactNode
}

/**
 * @alpha
 */
export function PortableTextEditorProvider({
  path,
  children,
  initialConfig,
  ...docHandle
}: PortableTextEditorProviderProps): React.ReactNode {
  const instance = useSanityInstance(docHandle)
  const {getCurrent} = getDocumentState<
    SanityDocument & Record<string, PortableTextBlock[] | undefined>,
    string
  >(instance, docHandle, path)
  const [initialValue] = useState(getCurrent)

  return (
    <EditorProvider initialConfig={{initialValue: initialValue ?? [], ...initialConfig}}>
      <UpdateValuePlugin path={path} {...docHandle} />
      {children}
    </EditorProvider>
  )
}
