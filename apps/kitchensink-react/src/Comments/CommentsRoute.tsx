import {
  type Comment,
  type CommentMessage,
  type CommentStatus,
  type CommentThread,
  useCommentActions,
  useCommentThreads,
  useDocumentProjection,
  useDocuments,
  useResource,
} from '@sanity/sdk-react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Inline,
  Select,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {Code} from '@sanity/ui/code'
import {type JSX, useState} from 'react'
import {useSearchParams} from 'react-router'

import {PageLayout} from '../components/PageLayout'

const DOCUMENT_TYPE = 'author'

/**
 * The Studio serving the kitchensink's default resource, `ppsg7ml5` / `test`.
 * Override with `?studio=<baseUrl>` when pointing at another one.
 */
const DEFAULT_STUDIO_BASE_URL = 'https://test-studio.sanity.build/test'

/**
 * Fields to hang threads off.
 *
 * Both exist on the `author` schema. That matters for the interop check: a
 * comment can be written against any path, but a Studio with no input at that
 * path has nowhere to show it, so a made-up field would look like a failure.
 */
const FIELDS = [
  {value: 'name', label: 'Name'},
  {value: 'role', label: 'Role'},
] as const

type Perspective = 'drafts' | 'published'
type StatusFilter = CommentStatus | 'all'

/** How a thread reads in each state, picked once instead of per prop. */
const RESOLVED_DISPLAY = {
  tone: 'transparent',
  badge: 'default',
  action: 'Reopen',
  nextStatus: 'open',
} as const

const OPEN_DISPLAY = {
  tone: 'default',
  badge: 'primary',
  action: 'Resolve',
  nextStatus: 'resolved',
} as const

/** Wraps plain text as the Portable Text the Studio stores. */
function toMessage(text: string): CommentMessage {
  return [
    {
      _type: 'block',
      _key: crypto.randomUUID(),
      style: 'normal',
      markDefs: [],
      children: [{_type: 'span', _key: crypto.randomUUID(), text, marks: []}],
    },
  ]
}

/** Flattens a message for display. Mentions render as nothing, which is fine here. */
function toPlainText(message: CommentMessage): string {
  if (!message) return ''
  return message
    .map((block) => {
      const children = (block as {children?: {text?: string}[]}).children ?? []
      return children.map((child) => child.text ?? '').join('')
    })
    .join('\n')
}

function Composer({
  label,
  initialValue = '',
  testId,
  onSubmit,
  onCancel,
}: {
  label: string
  initialValue?: string
  testId: string
  onSubmit: (text: string) => void
  onCancel?: () => void
}): JSX.Element {
  const [text, setText] = useState(initialValue)

  return (
    <Flex gap={2} align="center">
      <Box flex={1}>
        <TextInput
          data-testid={`${testId}-input`}
          value={text}
          placeholder={label}
          onChange={(event) => setText(event.currentTarget.value)}
        />
      </Box>
      <Button
        data-testid={`${testId}-submit`}
        mode="default"
        text={label}
        disabled={text.trim().length === 0}
        onClick={() => {
          onSubmit(text.trim())
          setText('')
        }}
      />
      {onCancel ? (
        <Button data-testid={`${testId}-cancel`} mode="bleed" text="Cancel" onClick={onCancel} />
      ) : null}
    </Flex>
  )
}

/**
 * The author is optional: the organization store records it server-side rather
 * than on the document, so it can genuinely be absent.
 */
function authorLabel(comment: Comment): string {
  return comment.authorId ?? 'unknown author'
}

function CommentRow({
  comment,
  onSelect,
}: {
  comment: Comment
  onSelect: (comment: Comment) => void
}): JSX.Element {
  const {updateComment, removeComment} = useCommentActions()
  const [editing, setEditing] = useState(false)

  return (
    <Card padding={3} radius={2} border data-testid="comment" data-comment-id={comment.id}>
      <Stack gap={3}>
        <Flex align="center" gap={2}>
          <Code size={0} data-testid="comment-author">
            {authorLabel(comment)}
          </Code>
          {comment.lastEditedAt ? <Badge tone="caution">edited</Badge> : null}
          {comment.state ? <Badge tone="critical">{comment.state.type}</Badge> : null}
        </Flex>

        {editing ? (
          <Composer
            label="Save"
            testId="comment-edit"
            initialValue={toPlainText(comment.message)}
            onCancel={() => setEditing(false)}
            onSubmit={(text) => {
              updateComment({commentId: comment.id, message: toMessage(text)})
              setEditing(false)
            }}
          />
        ) : (
          <Text size={1} data-testid="comment-message">
            {toPlainText(comment.message)}
          </Text>
        )}

        <Inline gap={2}>
          <Button
            data-testid="comment-edit-start"
            mode="bleed"
            text="Edit"
            onClick={() => setEditing(true)}
          />
          <Button
            data-testid="comment-delete"
            mode="bleed"
            tone="critical"
            text="Delete"
            onClick={() => removeComment({commentId: comment.id})}
          />
          <Button
            data-testid="comment-inspect"
            mode="bleed"
            text="Inspect"
            onClick={() => onSelect(comment)}
          />
        </Inline>
      </Stack>
    </Card>
  )
}

function ThreadCard({
  thread,
  documentId,
  perspective,
  onSelect,
}: {
  thread: CommentThread
  documentId: string
  perspective: Perspective
  onSelect: (comment: Comment) => void
}): JSX.Element {
  const {replyToComment, setCommentStatus} = useCommentActions()
  const display = thread.status === 'resolved' ? RESOLVED_DISPLAY : OPEN_DISPLAY

  return (
    <Card
      padding={3}
      radius={2}
      border
      tone={display.tone}
      data-testid="thread"
      data-thread-id={thread.threadId}
      data-count={thread.commentsCount}
    >
      <Stack gap={3}>
        <Flex align="center" gap={2}>
          <Badge tone={display.badge}>{thread.status}</Badge>
          <Text size={1} muted data-testid="thread-field">
            {thread.fieldPath}
          </Text>
          <Box flex={1} />
          <Button
            data-testid="thread-toggle-status"
            mode="ghost"
            text={display.action}
            onClick={() =>
              setCommentStatus({
                commentId: thread.parentComment.id,
                status: display.nextStatus,
              })
            }
          />
        </Flex>

        <CommentRow comment={thread.parentComment} onSelect={onSelect} />

        {thread.replies.map((reply) => (
          <Box key={reply.id} paddingLeft={4}>
            <CommentRow comment={reply} onSelect={onSelect} />
          </Box>
        ))}

        <Composer
          label="Reply"
          testId="thread-reply"
          onSubmit={(text) =>
            replyToComment({
              documentId,
              documentType: DOCUMENT_TYPE,
              perspective,
              parentCommentId: thread.parentComment.id,
              message: toMessage(text),
            })
          }
        />
      </Stack>
    </Card>
  )
}

function ThreadList({
  documentId,
  perspective,
  fieldPath,
  status,
  onSelect,
}: {
  documentId: string
  perspective: Perspective
  fieldPath: string | undefined
  status: StatusFilter
  onSelect: (comment: Comment) => void
}): JSX.Element {
  const {threads, isPending} = useCommentThreads({
    documentId,
    documentType: DOCUMENT_TYPE,
    perspective,
    ...(fieldPath === undefined ? {} : {fieldPath}),
    ...(status === 'all' ? {} : {status}),
  })

  if (threads.length === 0) {
    return (
      <Card padding={3} radius={2} tone="transparent">
        <Text size={1} muted data-testid="threads-empty">
          No comments yet. Writing the first one in this project creates the comments dataset.
        </Text>
      </Card>
    )
  }

  return (
    <Stack gap={3} data-testid="threads" data-count={threads.length} data-pending={isPending}>
      {threads.map((thread) => (
        <ThreadCard
          key={thread.threadId}
          thread={thread}
          documentId={documentId}
          perspective={perspective}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  )
}

/** The project and dataset in play, so a mismatch with the Studio link is visible. */
function ScopeText(): JSX.Element | null {
  const resource = useResource()
  if (!resource || !('projectId' in resource)) return null

  return (
    <Text size={1} muted>
      {`Project ${resource.projectId} · dataset ${resource.dataset}`}
    </Text>
  )
}

function Toolbar({
  perspective,
  onPerspectiveChange,
  fieldPath,
  onFieldPathChange,
  status,
  onStatusChange,
}: {
  perspective: Perspective
  onPerspectiveChange: (next: Perspective) => void
  fieldPath: string | undefined
  onFieldPathChange: (next: string | undefined) => void
  status: StatusFilter
  onStatusChange: (next: StatusFilter) => void
}): JSX.Element {
  return (
    <Flex gap={3} wrap="wrap">
      <Select
        data-testid="comments-perspective"
        value={perspective}
        onChange={(event) =>
          onPerspectiveChange(event.currentTarget.value === 'published' ? 'published' : 'drafts')
        }
      >
        <option value="drafts">drafts</option>
        <option value="published">published</option>
      </Select>

      <Select
        data-testid="comments-field"
        value={fieldPath ?? 'any'}
        onChange={(event) => {
          const next = event.currentTarget.value
          onFieldPathChange(next === 'any' ? undefined : next)
        }}
      >
        <option value="any">Every field</option>
        {FIELDS.map((field) => (
          <option key={field.value} value={field.value}>
            {field.label}
          </option>
        ))}
      </Select>

      <Select
        data-testid="comments-status"
        value={status}
        onChange={(event) => onStatusChange(event.currentTarget.value as StatusFilter)}
      >
        <option value="all">Open and resolved</option>
        <option value="open">Open</option>
        <option value="resolved">Resolved</option>
      </Select>
    </Flex>
  )
}

function DocumentCard({
  documentId,
  studioUrl,
}: {
  documentId: string
  studioUrl: string
}): JSX.Element {
  const {data} = useDocumentProjection<{name: string | null}>({
    documentId,
    documentType: DOCUMENT_TYPE,
    projection: `{name}`,
  })

  return (
    <Card padding={3} radius={2} tone="transparent">
      <Flex align="flex-start" gap={3}>
        <Stack gap={3} flex={1}>
          <Text size={1} weight="medium">
            {data?.name ?? 'Untitled'}
          </Text>
          <Code size={0} data-testid="comments-document-id">
            {documentId}
          </Code>
          <ScopeText />
        </Stack>
        <Button
          as="a"
          href={studioUrl}
          target="_blank"
          rel="noreferrer"
          mode="ghost"
          text="Open in Studio"
          data-testid="comments-studio-link"
        />
      </Flex>
    </Card>
  )
}

/**
 * The selected comment, verbatim.
 *
 * The most useful thing on this page for checking interop: put it beside a
 * Studio-written comment and the `target` objects should match field for field.
 */
function Inspector({comment}: {comment: Comment | undefined}): JSX.Element | null {
  if (!comment) return null

  return (
    <Stack gap={2}>
      <Text size={1} weight="semibold">
        Stored document
      </Text>
      <Card padding={3} radius={2} border overflow="auto">
        <Code size={0} language="json" data-testid="comment-json">
          {JSON.stringify(comment, null, 2)}
        </Code>
      </Card>
    </Stack>
  )
}

function CommentsDemo({documentId}: {documentId: string}): JSX.Element {
  const [searchParams] = useSearchParams()
  const [perspective, setPerspective] = useState<Perspective>('drafts')
  const [fieldPath, setFieldPath] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<Comment | undefined>(undefined)
  // Separate from the filter above. One control doing both meant "Every field",
  // a sensible default for reading, silently became "attach to nothing" when
  // writing.
  const [newThreadFieldPath, setNewThreadFieldPath] = useState<string>(FIELDS[0].value)
  const {createComment} = useCommentActions()

  const studioBase = searchParams.get('studio') ?? DEFAULT_STUDIO_BASE_URL
  const studioUrl = `${studioBase}/intent/edit/id=${encodeURIComponent(documentId)};type=${DOCUMENT_TYPE}`

  return (
    <PageLayout
      title="Comments"
      subtitle="These are the same comments the Studio shows. Write one here and it appears there, and the other way round."
    >
      <DocumentCard documentId={documentId} studioUrl={studioUrl} />

      <Toolbar
        perspective={perspective}
        onPerspectiveChange={setPerspective}
        fieldPath={fieldPath}
        onFieldPathChange={setFieldPath}
        status={status}
        onStatusChange={setStatus}
      />

      <Stack gap={3}>
        <Text size={1} weight="semibold">
          New thread
        </Text>
        <Flex gap={2} align="center">
          <Text size={1} muted>
            On field
          </Text>
          <Select
            data-testid="comments-new-thread-field"
            value={newThreadFieldPath}
            onChange={(event) => setNewThreadFieldPath(event.currentTarget.value)}
          >
            {FIELDS.map((field) => (
              <option key={field.value} value={field.value}>
                {field.label}
              </option>
            ))}
          </Select>
        </Flex>
        <Composer
          label="Comment"
          testId="comments-new-thread"
          onSubmit={(text) =>
            createComment({
              documentId,
              documentType: DOCUMENT_TYPE,
              perspective,
              fieldPath: newThreadFieldPath,
              message: toMessage(text),
            })
          }
        />
      </Stack>

      <ThreadList
        documentId={documentId}
        perspective={perspective}
        fieldPath={fieldPath}
        status={status}
        onSelect={setSelected}
      />

      <Inspector comment={selected} />
    </PageLayout>
  )
}

function NoDocuments({documentIdParam}: {documentIdParam: string | null}): JSX.Element {
  const detail = documentIdParam
    ? `No ${DOCUMENT_TYPE} document with id ${documentIdParam}.`
    : `No ${DOCUMENT_TYPE} documents in this dataset.`

  return (
    <PageLayout title="Comments" subtitle="Nothing to comment on">
      <Card padding={3} radius={2} tone="caution">
        <Text size={1} data-testid="comments-no-documents">
          {detail}
        </Text>
      </Card>
    </PageLayout>
  )
}

export function CommentsRoute(): JSX.Element {
  const [searchParams] = useSearchParams()
  const documentIdParam = searchParams.get('documentId')

  // Defaults to a real document so the route is useful straight away, with no id
  // to look up first.
  const {data} = useDocuments({
    documentType: DOCUMENT_TYPE,
    batchSize: 1,
    orderings: [{field: '_createdAt', direction: 'desc'}],
    ...(documentIdParam
      ? {filter: '_id == $documentId', params: {documentId: documentIdParam}}
      : {}),
  })

  const documentId = data[0]?.documentId
  if (!documentId) return <NoDocuments documentIdParam={documentIdParam} />

  return <CommentsDemo documentId={documentId} />
}
