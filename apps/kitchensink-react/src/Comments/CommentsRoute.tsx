import {useActiveReleases, useCurrentUser, useQuery} from '@sanity/sdk-react'
import {
  type Comment,
  type CommentAnchor,
  type CommentReactionShortName,
  type CommentsReadScope,
  type CommentStatus,
  type CommentThread,
  useCommentActions,
  useCommentThreads,
} from '@sanity/sdk-react/collaboration'
import {Badge, Button, Card, Select, Spinner, TextInput} from '@sanity/ui'
import {type JSX, Suspense, useState} from 'react'
import {useSearchParams} from 'react-router'
import {Box, Code, Flex, HStack, Text, VStack} from 'ui5'

import {DocumentHeaderCard} from '../components/DocumentHeaderCard'
import {PageLayout} from '../components/PageLayout'
import {useDefaultDocumentId} from '../components/useDefaultDocumentId'
import {toMessage, toPlainText} from './commentMessage'
import {CommentsStoreLink} from './CommentsStoreLink'

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
 * the mechanical case `updateCommentAnchor` exists for — the text moved, nobody
 * edited the comment, so it must not come back marked as edited.
 */
function AnchorControls({comment}: {comment: Comment}): JSX.Element | null {
  const {updateCommentAnchor} = useCommentActions()
  const blockKey = comment.selection?.value[0]?._key
  if (!blockKey) return null

  return (
    <HStack gap={2}>
      <Button
        data-testid="comment-reanchor"
        mode="bleed"
        text="Re-anchor"
        onClick={() =>
          updateCommentAnchor({
            commentId: comment.id,
            anchor: {
              type: 'portable-text',
              start: {_key: blockKey, offset: 0},
              end: {_key: blockKey, offset: 3},
            },
          })
        }
      />
      <Button
        data-testid="comment-clear-anchor"
        mode="bleed"
        text="Clear anchor"
        onClick={() => updateCommentAnchor({commentId: comment.id, anchor: null})}
      />
    </HStack>
  )
}

/**
 * Who wrote a comment, and what the SDK has to say about its state.
 *
 * The badges are the point: `edited` is local until the listener catches up,
 * `createError` and `createRetrying` are the states a failed write leaves
 * behind, and `inline` says the API resolved the anchor into a selection.
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
  onSelect,
}: {
  thread: CommentThread
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
  fieldPath,
  status,
  scope,
  onSelect,
}: {
  documentId: string
  fieldPath: string | undefined
  status: StatusFilter
  scope: CommentsReadScope
  onSelect: (comment: Comment) => void
}): JSX.Element {
  const {threads, isPending} = useCommentThreads({
    documentId,
    documentType: DOCUMENT_TYPE,
    scope,
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
        <ThreadCard key={thread.threadId} thread={thread} onSelect={onSelect} />
      ))}
    </VStack>
  )
}

const DOCUMENTS_QUERY = '*[_type == $type] | order(_createdAt desc)[0...50]{_id, name}'

/**
 * Which `author` document the page works on, written back to `?documentId=` so
 * the Studio link, the header card and a reload all follow along.
 */
function DocumentSelect({documentId}: {documentId: string}): JSX.Element {
  const [, setSearchParams] = useSearchParams()
  const {data} = useQuery<{_id: string; name: string | null}[]>({
    query: DOCUMENTS_QUERY,
    params: {type: DOCUMENT_TYPE},
  })

  // An id from `?documentId=` can sit outside the slice above, and a select
  // with no matching option silently shows the first one instead.
  const documents = data.some((doc) => doc._id === documentId)
    ? data
    : [{_id: documentId, name: null}, ...data]

  return (
    <Select
      data-testid="comments-document"
      value={documentId}
      onChange={(event) => {
        const next = event.currentTarget.value
        setSearchParams((previous) => {
          previous.set('documentId', next)
          return previous
        })
      }}
    >
      {documents.map((doc) => (
        <option key={doc._id} value={doc._id}>
          {`${doc.name ?? 'Untitled'} · ${doc._id}`}
        </option>
      ))}
    </Select>
  )
}

/**
 * Which of the candidate ids the dataset actually holds a document under. The
 * `raw` perspective is the only one that returns a version document as itself
 * rather than folding it into the document it is a version of.
 */
const DOCUMENT_IDS_QUERY = '*[_id in $ids]._id'

/**
 * The id comments are read and written against.
 *
 * Passing a draft or a version id is what makes the scopes diverge: `exact`
 * narrows to that id alone, while `perspective` pools a draft with its
 * published document and keeps a version to itself.
 *
 * Every id is offered whether or not a document exists under it, since a comment
 * can be written against any of them. The ones that do exist come first and the
 * rest say so, so picking a release that has no version of this document is a
 * deliberate choice rather than a hunt.
 */
function TargetIdSelect({
  publishedId,
  value,
  onChange,
}: {
  publishedId: string
  value: string
  onChange: (next: string) => void
}): JSX.Element {
  const releases = useActiveReleases()

  const candidates = [
    {id: publishedId, label: 'published'},
    {id: `drafts.${publishedId}`, label: 'draft'},
    ...releases.map((release) => ({
      id: `versions.${release.name}.${publishedId}`,
      label: `version ${release.metadata?.title ?? release.name}`,
    })),
  ]

  const {data} = useQuery<string[]>({
    query: DOCUMENT_IDS_QUERY,
    params: {ids: candidates.map((candidate) => candidate.id)},
    perspective: 'raw',
  })

  // Ids with a document first, so a release that actually has a version of this
  // document is at the top rather than somewhere among the releases that do not.
  const exists = (candidate: {id: string}) => data.includes(candidate.id)
  const options = [...candidates.filter(exists), ...candidates.filter((c) => !exists(c))].map(
    (candidate) => ({
      id: candidate.id,
      label: exists(candidate)
        ? `${candidate.label} · ${candidate.id}`
        : `${candidate.label} · ${candidate.id} (no document)`,
    }),
  )

  return (
    <Select
      data-testid="comments-target"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </Select>
  )
}

function Toolbar({
  fieldPath,
  onFieldPathChange,
  status,
  onStatusChange,
  scope,
  onScopeChange,
}: {
  fieldPath: string | undefined
  onFieldPathChange: (next: string | undefined) => void
  status: StatusFilter
  onStatusChange: (next: StatusFilter) => void
  scope: CommentsReadScope
  onScopeChange: (next: CommentsReadScope) => void
}): JSX.Element {
  return (
    <Flex flexWrap="wrap" gap={3}>
      <Select
        data-testid="comments-scope"
        value={scope}
        onChange={(event) => onScopeChange(event.currentTarget.value as CommentsReadScope)}
      >
        <option value="perspective">Scope: perspective</option>
        <option value="exact">Scope: exact</option>
        <option value="all">Scope: all</option>
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
 * makes it easy to write an anchor that does not resolve and see what the API
 * says about it.
 */
function AnchorFields({
  anchor,
  onChange,
}: {
  anchor: CommentAnchor
  onChange: (next: CommentAnchor) => void
}): JSX.Element {
  const setOffset = (end: 'start' | 'end', value: string) =>
    onChange({...anchor, [end]: {...anchor[end], offset: Number(value) || 0}})

  return (
    <Flex alignItems="center" gap={2}>
      <Text size={1} muted>
        Block
      </Text>
      <TextInput
        data-testid="comments-anchor-key"
        value={anchor.start._key}
        onChange={(event) => {
          const _key = event.currentTarget.value
          onChange({...anchor, start: {...anchor.start, _key}, end: {...anchor.end, _key}})
        }}
      />
      <Text size={1} muted>
        from
      </Text>
      <TextInput
        data-testid="comments-anchor-start"
        value={String(anchor.start.offset)}
        onChange={(event) => setOffset('start', event.currentTarget.value)}
      />
      <Text size={1} muted>
        to
      </Text>
      <TextInput
        data-testid="comments-anchor-end"
        value={String(anchor.end.offset)}
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
function NewThreadPanel({documentId}: {documentId: string}): JSX.Element {
  const {createComment} = useCommentActions()
  const [fieldPath, setFieldPath] = useState<string>(FIELDS[0].value)
  const [anchor, setAnchor] = useState<CommentAnchor>({
    type: 'portable-text',
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

      {/* An anchor only means something in a Portable Text field. */}
      {isPortableTextField ? <AnchorFields anchor={anchor} onChange={setAnchor} /> : null}

      <Composer
        label="Comment"
        testId="comments-new-thread"
        onSubmit={(text) =>
          createComment({
            documentId,
            documentType: DOCUMENT_TYPE,
            fieldPath,
            message: toMessage(text),
            ...(isPortableTextField ? {anchor} : {}),
          })
        }
      />
    </VStack>
  )
}

function CommentsDemo({documentId}: {documentId: string}): JSX.Element {
  const [searchParams] = useSearchParams()
  const [fieldPath, setFieldPath] = useState<string | undefined>(undefined)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [scope, setScope] = useState<CommentsReadScope>('perspective')
  const [selected, setSelected] = useState<Comment | undefined>(undefined)
  const [targetId, setTargetId] = useState(documentId)

  // Another document's ids are not this one's, so the target goes back to the
  // published id whenever the document changes under it.
  const [previousDocumentId, setPreviousDocumentId] = useState(documentId)
  if (previousDocumentId !== documentId) {
    setPreviousDocumentId(documentId)
    setTargetId(documentId)
  }

  const studioBase = searchParams.get('studio') ?? DEFAULT_STUDIO_BASE_URL
  const studioUrl = `${studioBase}/intent/edit/id=${encodeURIComponent(documentId)};type=${DOCUMENT_TYPE}`

  return (
    <PageLayout
      title="Comments"
      subtitle="These are the same comments the Studio shows, stored per organization. Write one here and it appears there, and the other way round."
    >
      <CommentsStoreLink to="/comments-legacy" label="Open the legacy add-on dataset comments" />
      <DocumentHeaderCard
        documentId={documentId}
        documentType={DOCUMENT_TYPE}
        studioUrl={studioUrl}
        testIdPrefix="comments"
      >
        <Flex alignItems="center" flexWrap="wrap" gap={2}>
          {/* Both selects read the dataset, so neither is there on first paint. */}
          <Suspense fallback={<Spinner />}>
            <DocumentSelect documentId={documentId} />
          </Suspense>
          <Suspense fallback={<Spinner />}>
            <TargetIdSelect publishedId={documentId} value={targetId} onChange={setTargetId} />
          </Suspense>
          <Text size={1} muted>
            Commenting on
          </Text>
          <Code size={0} data-testid="comments-target-id">
            {targetId}
          </Code>
        </Flex>
      </DocumentHeaderCard>

      <Toolbar
        fieldPath={fieldPath}
        onFieldPathChange={setFieldPath}
        status={status}
        onStatusChange={setStatus}
        scope={scope}
        onScopeChange={setScope}
      />

      <NewThreadPanel documentId={targetId} />

      {/* `useCommentThreads` suspends until the list loads. Without a boundary
          here the nearest one is `SanityApp`'s, which would blank the page —
          and everything above is usable while the comments are still coming. */}
      <Suspense fallback={<Spinner />}>
        <ThreadList
          documentId={targetId}
          fieldPath={fieldPath}
          status={status}
          scope={scope}
          onSelect={setSelected}
        />
      </Suspense>

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
