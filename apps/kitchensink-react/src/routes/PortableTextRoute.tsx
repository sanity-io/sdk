import {
  defineSchema,
  EditorProvider,
  PortableTextEditable,
  type RenderAnnotationFunction,
  type RenderDecoratorFunction,
  type RenderListItemFunction,
  type RenderStyleFunction,
  useEditor,
  useEditorSelector,
} from '@portabletext/editor'
import * as selectors from '@portabletext/editor/selectors'
import {SDKValuePlugin} from '@portabletext/plugin-sdk-value'
import {createSanityInstance, isDatasetResource, type SanityInstance} from '@sanity/sdk'
import {
  createDocumentHandle,
  type DocumentHandle,
  SanityInstanceProvider,
  useDocument,
  useDocuments,
  useResource,
} from '@sanity/sdk-react'
import {Badge, Box, Button, Card, Flex, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {type JSX, type ReactNode, Suspense, useEffect, useMemo, useState} from 'react'

import {isE2E} from '../sanityConfigs'

const PTE_FIELD_PATH = 'minimalBlock'

const schemaDefinition = defineSchema({
  styles: [{name: 'normal'}, {name: 'h1'}, {name: 'h2'}, {name: 'blockquote'}],
  lists: [{name: 'bullet'}, {name: 'number'}],
  decorators: [{name: 'strong'}, {name: 'em'}, {name: 'underline'}, {name: 'code'}],
  annotations: [{name: 'link', fields: [{name: 'href', type: 'string'}]}],
})

const renderDecorator: RenderDecoratorFunction = (props) => {
  if (props.value === 'strong') return <strong>{props.children}</strong>
  if (props.value === 'em') return <em>{props.children}</em>
  if (props.value === 'underline') return <u>{props.children}</u>
  if (props.value === 'code') {
    return (
      <code
        style={{
          background: 'var(--card-code-bg-color)',
          borderRadius: 3,
          fontFamily: 'monospace',
          fontSize: '0.95em',
          padding: '0.08em 0.25em',
        }}
      >
        {props.children}
      </code>
    )
  }
  return <>{props.children}</>
}

const renderAnnotation: RenderAnnotationFunction = (props) => {
  if (props.schemaType.name === 'link') {
    return <span style={{textDecoration: 'underline', color: 'blue'}}>{props.children}</span>
  }
  return <>{props.children}</>
}

const renderStyle: RenderStyleFunction = (props) => {
  if (props.value === 'h1') {
    return <h1 style={{margin: 0, fontSize: '1.5rem'}}>{props.children}</h1>
  }

  if (props.value === 'h2') {
    return <h2 style={{margin: 0, fontSize: '1.25rem'}}>{props.children}</h2>
  }

  if (props.value === 'blockquote') {
    return (
      <blockquote style={{borderLeft: '3px solid #6e7683', margin: 0, paddingLeft: '0.75rem'}}>
        {props.children}
      </blockquote>
    )
  }

  return <>{props.children}</>
}

const renderListItem: RenderListItemFunction = (props) => {
  const listStyleType = props.value === 'number' ? 'decimal' : 'disc'
  return <li style={{listStyleType, margin: 0}}>{props.children}</li>
}

function ToolbarButton(props: {
  active: boolean
  label: string
  onClick: () => void
  testId: string
}) {
  return (
    <Button
      mode={props.active ? 'default' : 'ghost'}
      tone={props.active ? 'primary' : 'default'}
      text={props.label}
      fontSize={1}
      padding={2}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
      data-testid={props.testId}
    />
  )
}

function Toolbar({testId}: {testId: string}) {
  const editor = useEditor()
  const strongActive = useEditorSelector(editor, selectors.isActiveDecorator('strong'))
  const emActive = useEditorSelector(editor, selectors.isActiveDecorator('em'))
  const underlineActive = useEditorSelector(editor, selectors.isActiveDecorator('underline'))
  const codeActive = useEditorSelector(editor, selectors.isActiveDecorator('code'))
  const h1Active = useEditorSelector(editor, selectors.isActiveStyle('h1'))
  const h2Active = useEditorSelector(editor, selectors.isActiveStyle('h2'))
  const blockquoteActive = useEditorSelector(editor, selectors.isActiveStyle('blockquote'))
  const bulletActive = useEditorSelector(editor, selectors.isActiveListItem('bullet'))
  const numberActive = useEditorSelector(editor, selectors.isActiveListItem('number'))
  const linkActive = useEditorSelector(editor, selectors.isActiveAnnotation('link'))

  const toggleDecorator = (decorator: string) => {
    editor.send({type: 'decorator.toggle', decorator})
    editor.send({type: 'focus'})
  }

  const toggleStyle = (style: string, active: boolean) => {
    if (active) {
      editor.send({type: 'style.remove', style})
    } else {
      editor.send({type: 'style.add', style})
    }
    editor.send({type: 'focus'})
  }

  const toggleList = (listItem: string) => {
    editor.send({type: 'list item.toggle', listItem})
    editor.send({type: 'focus'})
  }

  const undo = () => {
    editor.send({type: 'history.undo'})
    editor.send({type: 'focus'})
  }

  const redo = () => {
    editor.send({type: 'history.redo'})
    editor.send({type: 'focus'})
  }

  const toggleLink = () => {
    if (linkActive) {
      editor.send({type: 'annotation.remove', annotation: {name: 'link'}})
    } else {
      editor.send({
        type: 'annotation.add',
        annotation: {name: 'link', value: {href: 'https://www.sanity.io'}},
      })
    }
    editor.send({type: 'focus'})
  }

  return (
    <Flex gap={1} style={{flexWrap: 'wrap'}}>
      <ToolbarButton
        active={strongActive}
        label="B"
        onClick={() => toggleDecorator('strong')}
        testId={`pte-bold-${testId}`}
      />
      <ToolbarButton
        active={emActive}
        label="I"
        onClick={() => toggleDecorator('em')}
        testId={`pte-italic-${testId}`}
      />
      <ToolbarButton
        active={underlineActive}
        label="U"
        onClick={() => toggleDecorator('underline')}
        testId={`pte-underline-${testId}`}
      />
      <ToolbarButton
        active={codeActive}
        label="Code"
        onClick={() => toggleDecorator('code')}
        testId={`pte-code-${testId}`}
      />
      <ToolbarButton
        active={h1Active}
        label="H1"
        onClick={() => toggleStyle('h1', h1Active)}
        testId={`pte-h1-${testId}`}
      />
      <ToolbarButton
        active={h2Active}
        label="H2"
        onClick={() => toggleStyle('h2', h2Active)}
        testId={`pte-h2-${testId}`}
      />
      <ToolbarButton
        active={blockquoteActive}
        label="Quote"
        onClick={() => toggleStyle('blockquote', blockquoteActive)}
        testId={`pte-quote-${testId}`}
      />
      <ToolbarButton
        active={bulletActive}
        label="UL"
        onClick={() => toggleList('bullet')}
        testId={`pte-ul-${testId}`}
      />
      <ToolbarButton
        active={numberActive}
        label="OL"
        onClick={() => toggleList('number')}
        testId={`pte-ol-${testId}`}
      />
      <ToolbarButton
        active={linkActive}
        label="Link"
        onClick={toggleLink}
        testId={`pte-link-${testId}`}
      />
      <ToolbarButton active={false} label="Undo" onClick={undo} testId={`pte-undo-${testId}`} />
      <ToolbarButton active={false} label="Redo" onClick={redo} testId={`pte-redo-${testId}`} />
    </Flex>
  )
}

function FieldPreview({docHandle, testId}: {docHandle: DocumentHandle<'author'>; testId: string}) {
  const {data} = useDocument({...docHandle, path: PTE_FIELD_PATH})

  return (
    <Card padding={2} tone="transparent" border radius={2}>
      <pre
        style={{margin: 0, fontSize: 10, maxHeight: 180, overflow: 'auto'}}
        data-testid={`pte-preview-${testId}`}
      >
        {JSON.stringify(data ?? null, null, 2)}
      </pre>
    </Card>
  )
}

function EditorPane({
  docHandle,
  label,
  testId,
}: {
  docHandle: DocumentHandle<'author'>
  label: string
  testId: string
}) {
  return (
    <Card padding={3} radius={2} shadow={1} flex={1}>
      <Stack space={3}>
        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">
            {label}
          </Text>
          <Badge fontSize={0}>{docHandle.documentId}</Badge>
        </Flex>
        <EditorProvider initialConfig={{schemaDefinition}}>
          <Toolbar testId={testId} />
          <Card border radius={2} padding={3}>
            <PortableTextEditable
              style={{minHeight: 120, outline: 'none'}}
              renderDecorator={renderDecorator}
              renderAnnotation={renderAnnotation}
              renderListItem={renderListItem}
              renderStyle={renderStyle}
              data-testid={`pte-editable-${testId}`}
            />
          </Card>
          <SDKValuePlugin {...docHandle} path={PTE_FIELD_PATH} />
        </EditorProvider>
        <FieldPreview docHandle={docHandle} testId={testId} />
      </Stack>
    </Card>
  )
}

/**
 * Renders its children inside an independent, explicitly configured
 * SanityInstance so each pane behaves like a separate client: edits
 * round-trip through the Content Lake listener instead of sharing a
 * document store. The explicit projectId/dataset config is also required
 * by the plugin, which calls core APIs on the context instance directly
 * rather than resolving resources from the document handle.
 */
function IsolatedClient({
  projectId,
  dataset,
  children,
}: {
  projectId: string
  dataset: string
  children: ReactNode
}) {
  const [instance] = useState<SanityInstance>(() =>
    createSanityInstance({
      projectId,
      dataset,
      // Standalone instances don't inherit SanityApp's config, so in e2e
      // mode they need the staging API host set explicitly like App.tsx.
      ...(isE2E ? {auth: {apiHost: 'https://api.sanity.work'}} : {}),
    }),
  )

  useEffect(() => {
    return () => instance.dispose()
  }, [instance])

  return (
    <SanityInstanceProvider instance={instance} fallback={<Spinner />}>
      {children}
    </SanityInstanceProvider>
  )
}

function ConcurrentEditors() {
  const resource = useResource()

  const {data: documents} = useDocuments({documentType: 'author', batchSize: 1})
  const [documentId, setDocumentId] = useState<string>(documents[0]?.documentId ?? '')
  // Single draft value for the input. Avoid `pending || documentId`: clearing the
  // field would snap the value back to documentId and fight Playwright fill on
  // WebKit, leaving Load disabled because pending never sticks.
  const [draftId, setDraftId] = useState<string>(documents[0]?.documentId ?? '')

  const docHandle = useMemo<DocumentHandle<'author'> | null>(
    () =>
      documentId ? createDocumentHandle({documentType: 'author', documentId, resource}) : null,
    [documentId, resource],
  )

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={3}>
            <Text size={2} weight="semibold">
              Concurrent Portable Text editing
            </Text>
            <Text size={1} muted>
              Both panes edit the <code>{PTE_FIELD_PATH}</code> field of the same author document,
              but the right pane runs on its own SanityInstance, so edits sync through the server
              like two separate users. Type in both panes at once and toggle toolbar formatting
              (decorators, styles, lists, link, undo, redo) mid-typing: edits should interleave
              without overwriting each other.
            </Text>
            <Flex gap={3} align="flex-end">
              <Box flex={1}>
                <TextInput
                  fontSize={2}
                  value={draftId}
                  placeholder="Author document ID"
                  onChange={(e) => setDraftId(e.currentTarget.value)}
                  data-testid="pte-document-id-input"
                />
              </Box>
              <Button
                text="Load"
                tone="primary"
                fontSize={2}
                disabled={!draftId}
                onClick={() => setDocumentId(draftId)}
                data-testid="pte-load-button"
              />
            </Flex>
          </Stack>
        </Card>

        {!docHandle || !resource || !isDatasetResource(resource) ? (
          <Card padding={4} radius={2} shadow={1} tone="transparent">
            <Text align="center" muted>
              No author document found. Enter a document ID above.
            </Text>
          </Card>
        ) : (
          <Flex gap={4} align="flex-start">
            <IsolatedClient projectId={resource.projectId} dataset={resource.dataset}>
              <Suspense fallback={<Spinner />}>
                <EditorPane
                  key={`a-${docHandle.documentId}`}
                  docHandle={docHandle}
                  label="Client A"
                  testId="a"
                />
              </Suspense>
            </IsolatedClient>
            <IsolatedClient projectId={resource.projectId} dataset={resource.dataset}>
              <Suspense fallback={<Spinner />}>
                <EditorPane
                  key={`b-${docHandle.documentId}`}
                  docHandle={docHandle}
                  label="Client B"
                  testId="b"
                />
              </Suspense>
            </IsolatedClient>
          </Flex>
        )}
      </Stack>
    </Box>
  )
}

export function PortableTextRoute(): JSX.Element {
  return (
    <Suspense fallback={<Spinner />}>
      <ConcurrentEditors />
    </Suspense>
  )
}
