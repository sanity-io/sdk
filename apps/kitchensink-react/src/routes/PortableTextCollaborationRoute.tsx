import {
  defineSchema,
  defineTextBlock,
  EditorProvider,
  PortableTextEditable,
} from '@portabletext/editor'
import {NodePlugin} from '@portabletext/editor/plugins'
import {SDKValuePlugin} from '@portabletext/plugin-sdk-value'
import {createDocumentHandle, type DocumentHandle} from '@sanity/sdk-react'
import {type Comment, useCommentActions, useComments} from '@sanity/sdk-react/collaboration'
import {Badge, Box, Button, Flex, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {type JSX, type PropsWithChildren, Suspense, useCallback, useState} from 'react'
import {Card} from 'ui5'

import {toMessage, toPlainText} from '../Comments/commentMessage'
import {useSDKCommentAuthoring, useSDKCommentDecorations} from '../Comments/useSDKComments'
import {PageLayout} from '../components/PageLayout'
import {useDefaultDocumentId} from '../components/useDefaultDocumentId'

const DOCUMENT_TYPE = 'author'
const FIELD_PATH = 'minimalBlock'

const schemaDefinition = defineSchema({
  styles: [{name: 'normal'}],
  decorators: [],
  annotations: [],
})

const textBlockNode = defineTextBlock({
  type: 'block',
  render: ({attributes, children}) => <div {...attributes}>{children}</div>,
})

const editorNodes = [textBlockNode]

function Highlight({children}: PropsWithChildren) {
  return (
    <span style={{background: 'rgba(255, 213, 0, 0.45)', borderBottom: '1px solid #b8860b'}}>
      {children}
    </span>
  )
}

/**
 * The editor, its decorations, and the composer, all inside `EditorProvider`
 * because the comment hooks read the editor's selection and value.
 */
function CommentableEditor({
  docHandle,
  comments,
}: {
  docHandle: DocumentHandle<'author'>
  comments: Comment[]
}) {
  const {createComment} = useCommentActions()
  const {range, fieldValue} = useSDKCommentAuthoring()
  const decorations = useSDKCommentDecorations({comments, component: Highlight})
  const [draft, setDraft] = useState('')

  const submit = useCallback(() => {
    if (!range || !draft) return

    createComment({
      ...docHandle,
      fieldPath: FIELD_PATH,
      message: toMessage(draft),
      range,
      fieldValue,
    })
    setDraft('')
  }, [createComment, docHandle, draft, fieldValue, range])

  return (
    <Stack gap={3}>
      <NodePlugin nodes={editorNodes} />
      <Card density="compact">
        <PortableTextEditable
          style={{minHeight: 160, outline: 'none'}}
          rangeDecorations={decorations}
          data-testid="ptc-editable"
        />
      </Card>
      <SDKValuePlugin {...docHandle} path={FIELD_PATH} />
      <Flex gap={2} align="center">
        <Box flex={1}>
          <TextInput
            fontSize={1}
            value={draft}
            placeholder={range ? 'Comment on the selected text' : 'Select some text first'}
            onChange={(event) => setDraft(event.currentTarget.value)}
            data-testid="ptc-composer"
          />
        </Box>
        <Button
          text="Comment"
          tone="primary"
          fontSize={1}
          disabled={!range || !draft}
          onClick={submit}
          data-testid="ptc-submit"
        />
      </Flex>
    </Stack>
  )
}

function CommentList({comments}: {comments: Comment[]}) {
  if (comments.length === 0) {
    return (
      <Text size={1} muted data-testid="ptc-comments-empty">
        No comments on this field yet. Select some text and write one.
      </Text>
    )
  }

  return (
    <Stack gap={3} data-testid="ptc-comments" data-count={comments.length}>
      {comments.map((comment) => (
        <Card key={comment.id} density="compact" data-testid={`ptc-comment-${comment.id}`}>
          <Flex gap={2} align="center">
            <Badge fontSize={0} tone={comment.selection ? 'primary' : 'caution'}>
              {comment.selection ? 'inline' : 'field'}
            </Badge>
            <Text size={1}>{toPlainText(comment.message)}</Text>
          </Flex>
        </Card>
      ))}
    </Stack>
  )
}

function InlineComments({documentId}: {documentId: string}) {
  const docHandle = createDocumentHandle({documentType: DOCUMENT_TYPE, documentId})
  const {comments} = useComments({...docHandle, fieldPath: FIELD_PATH})

  return (
    <Flex gap={4} align="flex-start">
      <Card density="regular" style={{flex: 2}}>
        <EditorProvider initialConfig={{schemaDefinition}}>
          <CommentableEditor docHandle={docHandle} comments={comments} />
        </EditorProvider>
      </Card>
      <Card density="regular" style={{flex: 1}}>
        <CommentList comments={comments} />
      </Card>
    </Flex>
  )
}

export function PortableTextCollaborationRoute(): JSX.Element {
  const {documentId} = useDefaultDocumentId(DOCUMENT_TYPE)

  return (
    <PageLayout
      title="Portable Text comments"
      subtitle="Inline comments anchored into a Portable Text field"
    >
      <Stack gap={4}>
        <Text size={1} muted>
          Comments on the <code>{FIELD_PATH}</code> field of an author document, anchored to a run
          of text. The anchor is written as a <code>range</code> of offsets plus the editor&rsquo;s
          current <code>fieldValue</code>, so a comment lands on the right words even when the text
          it covers has not been saved yet. The API resolves that into a <code>selection</code>,
          which is what the highlights are drawn from.
        </Text>
        <Suspense fallback={<Spinner />}>
          {documentId ? (
            <InlineComments documentId={documentId} />
          ) : (
            <Text size={1} muted>
              No author document found.
            </Text>
          )}
        </Suspense>
      </Stack>
    </PageLayout>
  )
}
