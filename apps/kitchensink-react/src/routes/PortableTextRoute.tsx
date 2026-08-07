import {
  defineSchema,
  EditorProvider,
  PortableTextEditable,
  type RenderAnnotationFunction,
  type RenderDecoratorFunction,
  type RenderListItemFunction,
  type RenderStyleFunction,
} from '@portabletext/editor'
import {
  blockquote,
  bold,
  code,
  h1,
  h2,
  italic,
  type KeyboardShortcut,
  link,
  underline,
} from '@portabletext/keyboard-shortcuts'
import {SDKValuePlugin} from '@portabletext/plugin-sdk-value'
import {
  type ExtendAnnotationSchemaType,
  type ExtendDecoratorSchemaType,
  type ExtendListSchemaType,
  type ExtendStyleSchemaType,
  type ToolbarAnnotationSchemaType,
  type ToolbarDecoratorSchemaType,
  type ToolbarListSchemaType,
  type ToolbarStyleSchemaType,
  useAnnotationButton,
  useDecoratorButton,
  useHistoryButtons,
  useListButton,
  useStyleSelector,
  useToolbarSchema,
} from '@portabletext/toolbar'
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
import {
  type ElementType,
  type JSX,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {isE2E} from '../sanityConfigs'

const PTE_FIELD_PATH = 'minimalBlock'

const schemaDefinition = defineSchema({
  styles: [{name: 'normal'}, {name: 'h1'}, {name: 'h2'}, {name: 'blockquote'}],
  lists: [{name: 'bullet'}, {name: 'number'}],
  decorators: [{name: 'strong'}, {name: 'em'}, {name: 'underline'}, {name: 'code'}],
  annotations: [{name: 'link', fields: [{name: 'href', type: 'string'}]}],
})

const simpleDecoratorTags: Record<string, ElementType> = {
  strong: 'strong',
  em: 'em',
  underline: 'u',
}

const renderDecorator: RenderDecoratorFunction = (props) => {
  const Tag = simpleDecoratorTags[props.value]
  if (Tag) return <Tag>{props.children}</Tag>
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

// `@portabletext/toolbar`'s extend hooks are where a plain editor schema
// picks up the display metadata (title, keyboard shortcut) a toolbar needs.
// These are defined at module scope so `useToolbarSchema` doesn't recompute
// the extended schema on every render.
const decoratorDisplay: Record<string, {title: string; shortcut: KeyboardShortcut}> = {
  strong: {title: 'Bold', shortcut: bold},
  em: {title: 'Italic', shortcut: italic},
  underline: {title: 'Underline', shortcut: underline},
  code: {title: 'Code', shortcut: code},
}

const extendDecorator: ExtendDecoratorSchemaType = (decorator) => {
  const display = decoratorDisplay[decorator.name]
  return display ? {...decorator, ...display} : decorator
}

const extendAnnotation: ExtendAnnotationSchemaType = (annotation) => {
  if (annotation.name === 'link') {
    return {
      ...annotation,
      title: 'Link',
      shortcut: link,
      defaultValues: {href: 'https://www.sanity.io'},
    }
  }
  return annotation
}

const extendStyle: ExtendStyleSchemaType = (style) => {
  if (style.name === 'h1') return {...style, title: 'H1', shortcut: h1}
  if (style.name === 'h2') return {...style, title: 'H2', shortcut: h2}
  if (style.name === 'blockquote') return {...style, title: 'Quote', shortcut: blockquote}
  return style
}

const extendList: ExtendListSchemaType = (list) => {
  if (list.name === 'bullet') return {...list, title: 'UL'}
  if (list.name === 'number') return {...list, title: 'OL'}
  return list
}

function DecoratorButton({
  schemaType,
  testId,
}: {
  schemaType: ToolbarDecoratorSchemaType
  testId: string
}) {
  const decoratorButton = useDecoratorButton({schemaType})
  const active = decoratorButton.snapshot.matches({enabled: 'active'})
  const label = schemaType.title ?? schemaType.name

  return (
    <Button
      mode={active ? 'default' : 'ghost'}
      tone={active ? 'primary' : 'default'}
      text={label}
      fontSize={1}
      padding={2}
      disabled={decoratorButton.snapshot.matches('disabled')}
      onClick={() => decoratorButton.send({type: 'toggle'})}
      data-testid={`pte-${label.toLowerCase()}-${testId}`}
    />
  )
}

function AnnotationButton({
  schemaType,
  testId,
}: {
  schemaType: ToolbarAnnotationSchemaType
  testId: string
}) {
  const annotationButton = useAnnotationButton({schemaType})
  const active = annotationButton.snapshot.matches({enabled: 'active'})
  const label = schemaType.title ?? schemaType.name

  // `defaultValues` from the schema extension stands in for the insert
  // dialog a real toolbar would show: it lets `add` be sent directly
  // instead of going through the button's dialog-open state.
  const toggle = () => {
    if (active) {
      annotationButton.send({type: 'remove'})
    } else {
      annotationButton.send({type: 'add', annotation: {value: schemaType.defaultValues ?? {}}})
    }
  }

  return (
    <Button
      mode={active ? 'default' : 'ghost'}
      tone={active ? 'primary' : 'default'}
      text={label}
      fontSize={1}
      padding={2}
      disabled={annotationButton.snapshot.matches('disabled')}
      onClick={toggle}
      data-testid={`pte-${label.toLowerCase()}-${testId}`}
    />
  )
}

function ListButton({schemaType, testId}: {schemaType: ToolbarListSchemaType; testId: string}) {
  const listButton = useListButton({schemaType})
  const active = listButton.snapshot.matches({enabled: 'active'})
  const label = schemaType.title ?? schemaType.name

  return (
    <Button
      mode={active ? 'default' : 'ghost'}
      tone={active ? 'primary' : 'default'}
      text={label}
      fontSize={1}
      padding={2}
      disabled={listButton.snapshot.matches('disabled')}
      onClick={() => listButton.send({type: 'toggle'})}
      data-testid={`pte-${label.toLowerCase()}-${testId}`}
    />
  )
}

// Styles are mutually exclusive (a block has at most one), so
// `useStyleSelector` manages the whole group behind one state machine
// instead of one hook call per button, unlike decorators/lists/annotations.
function StyleButtons({
  schemaTypes,
  testId,
}: {
  schemaTypes: ReadonlyArray<ToolbarStyleSchemaType>
  testId: string
}) {
  const styleSelector = useStyleSelector({schemaTypes})
  const disabled = styleSelector.snapshot.matches('disabled')
  const {activeStyle} = styleSelector.snapshot.context

  return (
    <>
      {schemaTypes
        .filter((schemaType) => schemaType.name !== 'normal')
        .map((schemaType) => {
          const active = activeStyle === schemaType.name
          const label = schemaType.title ?? schemaType.name
          return (
            <Button
              key={schemaType.name}
              mode={active ? 'default' : 'ghost'}
              tone={active ? 'primary' : 'default'}
              text={label}
              fontSize={1}
              padding={2}
              disabled={disabled}
              onClick={() => styleSelector.send({type: 'toggle', style: schemaType.name})}
              data-testid={`pte-${label.toLowerCase()}-${testId}`}
            />
          )
        })}
    </>
  )
}

function HistoryButtons({testId}: {testId: string}) {
  const historyButtons = useHistoryButtons()
  const disabled = historyButtons.snapshot.matches('disabled')

  return (
    <>
      <Button
        mode="ghost"
        text="Undo"
        fontSize={1}
        padding={2}
        disabled={disabled}
        onClick={() => historyButtons.send({type: 'history.undo'})}
        data-testid={`pte-undo-${testId}`}
      />
      <Button
        mode="ghost"
        text="Redo"
        fontSize={1}
        padding={2}
        disabled={disabled}
        onClick={() => historyButtons.send({type: 'history.redo'})}
        data-testid={`pte-redo-${testId}`}
      />
    </>
  )
}

function Toolbar({testId}: {testId: string}) {
  const toolbarSchema = useToolbarSchema({
    extendDecorator,
    extendAnnotation,
    extendStyle,
    extendList,
  })

  return (
    <Flex gap={1} style={{flexWrap: 'wrap'}}>
      {toolbarSchema.decorators.map((decorator) => (
        <DecoratorButton key={decorator.name} schemaType={decorator} testId={testId} />
      ))}
      <StyleButtons schemaTypes={toolbarSchema.styles} testId={testId} />
      {toolbarSchema.lists.map((list) => (
        <ListButton key={list.name} schemaType={list} testId={testId} />
      ))}
      {toolbarSchema.annotations.map((annotation) => (
        <AnnotationButton key={annotation.name} schemaType={annotation} testId={testId} />
      ))}
      <HistoryButtons testId={testId} />
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
