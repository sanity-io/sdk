import {randomUuid} from '@sanity/sdk/_internal'
import {
  type Comment,
  type CommentMessage,
  type CommentRange,
  type CommentReactionShortName,
  type CommentStatus,
  type CommentThread,
  type CommentVariants,
  useCommentActions,
  useCurrentUser,
  useDocumentComments,
} from '@sanity/sdk-react'
import {Badge, Button, Card, Select, TextInput} from '@sanity/ui'
import {type JSX, useState} from 'react'
import {useSearchParams} from 'react-router'
import {Box, Code, Flex, HStack, Text, VStack} from 'ui5'

import {DocumentHeaderCard} from '../components/DocumentHeaderCard'
import {PageLayout} from '../components/PageLayout'
import {useDefaultDocumentId} from '../components/useDefaultDocumentId'

const DOCUMENT_TYPE = 'author'

/**
 * The Studio serving the kitchensink's default resource, `ppsg7ml5` / `test`.
 * Override with `?studio=<baseUrl>` when pointing at another one.
 */
const DEFAULT_STUDIO_BASE_URL = 'https://test-studio.sanity.build/test'

/**
 * Fields to hang threads off.
 *
 * All three exist on the `author` schema. That matters for the interop check: a
 * comment can be written against any path, but a Studio with no input at that
 * path has nowhere to show it, so a made-up field would look like a failure.
 *
 * `minimalBlock` is the Portable Text one, so it is the only field an inline
 * comment can anchor into.
 */
const FIELDS = [
  {value: 'name', label: 'Name', portableText: false},
  {value: 'role', label: 'Role', portableText: false},
  {value: 'minimalBlock', label: 'Minimal block (Portable Text)', portableText: true},
] as const

/** Enough to see a count go up and back down again. */
const REACTIONS: CommentReactionShortName[] = [':+1:', ':eyes:']

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
      _key: randomUuid(),
      style: 'normal',
      markDefs: [],
      children: [{_type: 'span', _key: randomUuid(), text, marks: []}],
    },
  ]
}

/** Flattens a message for display. Mentions render as nothing, which is fine here. */
function toPlainText(message: CommentMessage): string {
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
    <Flex alignItems="center" gap={2}>
      <Box flexGrow={1}>
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

/**
 * The reactions on a comment, as toggles.
 *
 * The SDK's add and remove are separate calls rather than one toggle, because
 * only the app knows whether this user has already reacted. That decision is
 * this component: it reads the current user out of the reaction list.
 */
function Reactions({comment}: {comment: Comment}): JSX.Element {
  const {addReaction, removeReaction} = useCommentActions()
  const currentUser = useCurrentUser()

  return (
    <HStack gap={2} data-testid="comment-reactions">
      {REACTIONS.map((shortName) => {
        const reactions = comment.reactions.filter((reaction) => reaction.shortName === shortName)
        const mine = reactions.some((reaction) => reaction.userId === currentUser?.id)

        return (
          <Button
            key={shortName}
            data-testid={`comment-reaction-${shortName.replaceAll(':', '')}`}
            data-count={reactions.length}
            data-mine={mine}
            mode={mine ? 'default' : 'bleed'}
            text={`${shortName} ${reactions.length}`}
            onClick={() =>
              mine
                ? removeReaction({commentId: comment.id, shortName})
                : addReaction({commentId: comment.id, shortName})
            }
          />
        )
      })}
    </HStack>
  )
}

/**
 * The controls for an inline comment's anchor.
 *
 * Only shown once the API has resolved a selection, since there is nothing to
 * move until then. Re-anchoring keeps the block and shifts the offsets, which is
 * the mechanical case `updateCommentRange` exists for — the text moved, nobody
 * edited the comment, so it must not come back marked as edited.
 */
function AnchorControls({comment}: {comment: Comment}): JSX.Element | null {
  const {updateCommentRange} = useCommentActions()
  const blockKey = comment.selection?.value[0]?._key
  if (!blockKey) return null

  return (
    <HStack gap={2}>
      <Button
        data-testid="comment-reanchor"
        mode="bleed"
        text="Re-anchor"
        onClick={() =>
          updateCommentRange({
            commentId: comment.id,
            range: {start: {_key: blockKey, offset: 0}, end: {_key: blockKey, offset: 3}},
          })
        }
      />
      <Button
        data-testid="comment-clear-anchor"
        mode="bleed"
        text="Clear anchor"
        onClick={() => updateCommentRange({commentId: comment.id, range: null})}
      />
    </HStack>
  )
}

/**
 * Who wrote a comment, and what the SDK has to say about its state.
 *
 * The badges are the point: `edited` is local until the listener catches up,
 * `createError` and `createRetrying` are the states a failed write leaves
 * behind, and `inline` says the API resolved the range into a selection.
 */
function CommentHeader({comment}: {comment: Comment}): JSX.Element {
  return (
    <Flex alignItems="center" gap={2}>
      <Code size={0} data-testid="comment-author">
        {authorLabel(comment)}
      </Code>
      {comment.lastEditedAt ? <Badge tone="caution">edited</Badge> : null}
      {comment.state ? <Badge tone="critical">{comment.state.type}</Badge> : null}
      {comment.selection ? <Badge tone="primary">inline</Badge> : null}
    </Flex>
  )
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
      <VStack gap={3}>
        <CommentHeader comment={comment} />

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

        <Reactions comment={comment} />

        <HStack gap={2}>
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
        </HStack>

        <AnchorControls comment={comment} />
      </VStack>
    </Card>
  )
}

function ThreadCard({
  thread,
  perspective,
  onSelect,
}: {
  thread: CommentThread
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
      <VStack gap={3}>
        <Flex alignItems="center" gap={2}>
          <Badge tone={display.badge}>{thread.status}</Badge>
          <Text size={1} muted data-testid="thread-field">
            {thread.fieldPath}
          </Text>
          <Box flexGrow={1} />
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
              perspective,
              parentCommentId: thread.parentComment.id,
              message: toMessage(text),
            })
          }
        />
      </VStack>
    </Card>
  )
}

function ThreadList({
  documentId,
  perspective,
  fieldPath,
  status,
  variants,
  onSelect,
}: {
  documentId: string
  perspective: Perspective
  fieldPath: string | undefined
  status: StatusFilter
  variants: CommentVariants
  onSelect: (comment: Comment) => void
}): JSX.Element {
  const {threads, isPending} = useDocumentComments({
    documentId,
    documentType: DOCUMENT_TYPE,
    perspective,
    variants,
    ...(fieldPath === undefined ? {} : {fieldPath}),
    ...(status === 'all' ? {} : {status}),
  })

  if (threads.length === 0) {
    return (
      <Card padding={3} radius={2} tone="transparent">
        <Text size={1} muted data-testid="threads-empty">
          No comments on this document yet.
        </Text>
      </Card>
    )
  }

  return (
    <VStack gap={3} data-testid="threads" data-count={threads.length} data-pending={isPending}>
      {threads.map((thread) => (
        <ThreadCard
          key={thread.threadId}
          thread={thread}
          perspective={perspective}
          onSelect={onSelect}
        />
      ))}
    </VStack>
  )
}

function Toolbar({
  perspective,
  onPerspectiveChange,
  fieldPath,
  onFieldPathChange,
  status,
  onStatusChange,
  variants,
  onVariantsChange,
}: {
  perspective: Perspective
  onPerspectiveChange: (next: Perspective) => void
  fieldPath: string | undefined
  onFieldPathChange: (next: string | undefined) => void
  status: StatusFilter
  onStatusChange: (next: StatusFilter) => void
  variants: CommentVariants
  onVariantsChange: (next: CommentVariants) => void
}): JSX.Element {
  return (
    <Flex flexWrap="wrap" gap={3}>
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
        data-testid="comments-variants"
        value={variants}
        onChange={(event) => onVariantsChange(event.currentTarget.value as CommentVariants)}
      >
        <option value="perspective">Variants: perspective</option>
        <option value="drafts">Variants: drafts</option>
        <option value="exact">Variants: exact</option>
        <option value="all">Variants: all</option>
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

/**
 * The selected comment, verbatim.
 *
 * The most useful thing on this page for checking interop: put it beside a
 * Studio-written comment and the `target` objects should match field for field.
 */
function Inspector({comment}: {comment: Comment | undefined}): JSX.Element | null {
  if (!comment) return null

  return (
    <VStack gap={2}>
      <Text size={1} weight="semibold">
        Stored document
      </Text>
      <Card padding={3} radius={2} border overflow="auto">
        <Code size={0} language="json" data-testid="comment-json">
          {JSON.stringify(comment, null, 2)}
        </Code>
      </Card>
    </VStack>
  )
}

/**
 * Where an inline comment attaches, entered by hand.
 *
 * A real app takes this from a Portable Text editor's selection. There is no
 * editor on this page, so the block key and offsets are typed in — which also
 * makes it easy to write a range that does not resolve and see what the API says
 * about it.
 */
function RangeFields({
  range,
  onChange,
}: {
  range: CommentRange
  onChange: (next: CommentRange) => void
}): JSX.Element {
  const setOffset = (end: 'start' | 'end', value: string) =>
    onChange({...range, [end]: {...range[end], offset: Number(value) || 0}})

  return (
    <Flex alignItems="center" gap={2}>
      <Text size={1} muted>
        Block
      </Text>
      <TextInput
        data-testid="comments-range-key"
        value={range.start._key}
        onChange={(event) => {
          const _key = event.currentTarget.value
          onChange({start: {...range.start, _key}, end: {...range.end, _key}})
        }}
      />
      <Text size={1} muted>
        from
      </Text>
      <TextInput
        data-testid="comments-range-start"
        value={String(range.start.offset)}
        onChange={(event) => setOffset('start', event.currentTarget.value)}
      />
      <Text size={1} muted>
        to
      </Text>
      <TextInput
        data-testid="comments-range-end"
        value={String(range.end.offset)}
        onChange={(event) => setOffset('end', event.currentTarget.value)}
      />
    </Flex>
  )
}

/**
 * Starts a thread, with its own field selector.
 *
 * Separate from the filter in the toolbar. One control doing both meant "Every
 * field", a sensible default for reading, silently became "attach to nothing"
 * when writing.
 */
function NewThreadPanel({
  documentId,
  perspective,
}: {
  documentId: string
  perspective: Perspective
}): JSX.Element {
  const {createComment} = useCommentActions()
  const [fieldPath, setFieldPath] = useState<string>(FIELDS[0].value)
  const [range, setRange] = useState<CommentRange>({
    // `b1` is the block key the e2e fixtures seed `minimalBlock` with.
    start: {_key: 'b1', offset: 0},
    end: {_key: 'b1', offset: 5},
  })

  const isPortableTextField = FIELDS.find((field) => field.value === fieldPath)?.portableText

  return (
    <VStack gap={3}>
      <Text size={1} weight="semibold">
        New thread
      </Text>
      <Flex alignItems="center" gap={2}>
        <Text size={1} muted>
          On field
        </Text>
        <Select
          data-testid="comments-new-thread-field"
          value={fieldPath}
          onChange={(event) => setFieldPath(event.currentTarget.value)}
        >
          {FIELDS.map((field) => (
            <option key={field.value} value={field.value}>
              {field.label}
            </option>
          ))}
        </Select>
      </Flex>

      {/* A range only means something in a Portable Text field. */}
      {isPortableTextField ? <RangeFields range={range} onChange={setRange} /> : null}

      <Composer
        label="Comment"
        testId="comments-new-thread"
        onSubmit={(text) =>
          createComment({
            documentId,
            documentType: DOCUMENT_TYPE,
            perspective,
            fieldPath,
            message: toMessage(text),
            ...(isPortableTextField ? {range} : {}),
          })
        }
      />
    </VStack>
  )
}

function CommentsDemo({documentId}: {documentId: string}): JSX.Element {
  const [searchParams] = useSearchParams()
  const [perspective, setPerspective] = useState<Perspective>('drafts')
  const [fieldPath, setFieldPath] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [variants, setVariants] = useState<CommentVariants>('perspective')
  const [selected, setSelected] = useState<Comment | undefined>(undefined)

  const studioBase = searchParams.get('studio') ?? DEFAULT_STUDIO_BASE_URL
  const studioUrl = `${studioBase}/intent/edit/id=${encodeURIComponent(documentId)};type=${DOCUMENT_TYPE}`

  return (
    <PageLayout
      title="Comments"
      subtitle="These are the same comments the Studio shows, stored per organization. Write one here and it appears there, and the other way round."
    >
      <DocumentHeaderCard
        documentId={documentId}
        documentType={DOCUMENT_TYPE}
        studioUrl={studioUrl}
        testIdPrefix="comments"
      />

      <Toolbar
        perspective={perspective}
        onPerspectiveChange={setPerspective}
        fieldPath={fieldPath}
        onFieldPathChange={setFieldPath}
        status={status}
        onStatusChange={setStatus}
        variants={variants}
        onVariantsChange={setVariants}
      />

      <NewThreadPanel documentId={documentId} perspective={perspective} />

      <ThreadList
        documentId={documentId}
        perspective={perspective}
        fieldPath={fieldPath}
        status={status}
        variants={variants}
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
  const {documentId, documentIdParam} = useDefaultDocumentId(DOCUMENT_TYPE)

  if (!documentId) return <NoDocuments documentIdParam={documentIdParam} />

  return <CommentsDemo documentId={documentId} />
}
