import {AddIcon} from '@sanity/icons/Add'
import {ChevronDownIcon} from '@sanity/icons/ChevronDown'
import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {ClockIcon} from '@sanity/icons/Clock'
import {DocumentIcon} from '@sanity/icons/Document'
import {
  createDocumentHandle,
  discardDocument,
  type DocumentHandle,
  type DocumentHistoryEvent,
  type DocumentHistoryEventType,
  isDeleteDocumentVersionHistoryEvent,
  isEditDocumentVersionHistoryEvent,
  isPublishDocumentVersionHistoryEvent,
  publishDocument,
  unpublishDocument,
  useApplyDocumentActions,
  useCreateDocument,
  useDocument,
  useDocumentHistory,
  useDocumentProjection,
  useDocuments,
  useEditDocument,
  useUsers,
} from '@sanity/sdk-react'
import {Button, Select, TextInput} from '@sanity/ui'
import {type JSX, Suspense, useId, useMemo, useState} from 'react'
import {Box, Card, Flex, Icon, IconButton, Indicator, List, Spinner, Text, VStack} from 'ui5'

import {LoadMore} from '../components/LoadMore'
import {PageLayout} from '../components/PageLayout'

const DOCUMENT_TYPE = 'article'
const PROJECTION = '{title}'

type ArticleHandle = DocumentHandle<typeof DOCUMENT_TYPE>
type TimelineTab = 'drafts' | 'published'
type IndicatorTone = 'positive' | 'caution' | 'critical' | 'neutral'

const EVENT_LABELS: Record<DocumentHistoryEventType, {label: string; tone: IndicatorTone}> = {
  publishDocumentVersion: {label: 'Published', tone: 'positive'},
  editDocumentVersion: {label: 'Edited', tone: 'caution'},
  createDocumentVersion: {label: 'Draft created', tone: 'neutral'},
  deleteDocumentVersion: {label: 'Draft discarded', tone: 'critical'},
  unpublishDocument: {label: 'Unpublished', tone: 'caution'},
  createLiveDocument: {label: 'Created', tone: 'positive'},
  updateLiveDocument: {label: 'Edited', tone: 'caution'},
  deleteDocumentGroup: {label: 'Deleted', tone: 'critical'},
  historyCleared: {label: 'History cleared', tone: 'neutral'},
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isExpandable(event: DocumentHistoryEvent): boolean {
  const isPublishOrDelete =
    isPublishDocumentVersionHistoryEvent(event) || isDeleteDocumentVersionHistoryEvent(event)
  if (!isPublishOrDelete) return false
  return Boolean(event.creationEvent && event.versionRevisionId)
}

function getParentId(event: DocumentHistoryEvent): string | undefined {
  return 'parentId' in event ? event.parentId : undefined
}

function getEventTitle(event: DocumentHistoryEvent): string {
  const {label} = EVENT_LABELS[event.type]
  if (!isEditDocumentVersionHistoryEvent(event)) return label
  const count = event.transactions.length
  return count > 1 ? `${label} (${count} edits)` : label
}

function resolveAuthorName(author: string, userNames: Map<string, string>): string {
  if (!author) return 'System'
  return userNames.get(author) ?? author
}

function buildUserDisplayMap(
  users: Array<{profile?: {id?: string; displayName?: string}}>,
): Map<string, string> {
  const entries = users.flatMap((u) =>
    u.profile?.id && u.profile.displayName ? [[u.profile.id, u.profile.displayName] as const] : [],
  )
  return new Map(entries)
}

function ArticleRow({
  handle,
  isSelected,
  onPick,
}: {
  handle: ArticleHandle
  isSelected: boolean
  onPick: (id: string) => void
}): JSX.Element {
  const {data} = useDocumentProjection<{title?: string}>({...handle, projection: PROJECTION})
  return (
    <List.ButtonItem
      selected={isSelected}
      start={<Icon aria-hidden icon={DocumentIcon} />}
      onClick={() => onPick(handle.documentId)}
    >
      <List.ItemText title={data.title || 'Untitled'} />
    </List.ButtonItem>
  )
}

function ArticlePickerSidebar({
  articles,
  activeId,
  onSelect,
  onCreate,
}: {
  articles: ArticleHandle[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
}): JSX.Element {
  return (
    <Box borderRight padding={3} style={{flex: '0 0 240px'}}>
      <VStack gap={3}>
        <Flex alignItems="center" justifyContent="space-between">
          <Text size={1} weight="semibold">
            Articles
          </Text>
          <IconButton aria-label="New article" icon={AddIcon} onClick={onCreate} />
        </Flex>
        <List>
          {articles.map((item) => (
            <Suspense key={item.documentId} fallback={<Spinner />}>
              <ArticleRow
                handle={item}
                isSelected={item.documentId === activeId}
                onPick={onSelect}
              />
            </Suspense>
          ))}
        </List>
      </VStack>
    </Box>
  )
}

function TextField({
  handle,
  field,
  label,
}: {
  handle: ArticleHandle
  field: 'title' | 'subtitle'
  label: string
}): JSX.Element {
  const {data} = useDocument<string>({...handle, path: field})
  const edit = useEditDocument<string>({...handle, path: field})
  const id = useId()

  return (
    <VStack gap={2}>
      <Text as="label" htmlFor={id} size={1} weight="semibold">
        {label}
      </Text>
      <TextInput id={id} value={data ?? ''} onChange={(e) => void edit(e.currentTarget.value)} />
    </VStack>
  )
}

function EditorActions({handle}: {handle: ArticleHandle}): JSX.Element {
  const {data} = useDocumentProjection<{title?: string}>({...handle, projection: PROJECTION})
  const apply = useApplyDocumentActions()
  const hasDraft = Boolean(data._status?.lastEditedDraftAt)
  const hasPublished = Boolean(data._status?.lastEditedPublishedAt)

  return (
    <Flex gap={2}>
      <Button
        disabled={!hasDraft}
        fontSize={1}
        mode="ghost"
        tone="caution"
        text="Discard"
        onClick={() => void apply(discardDocument(handle))}
      />
      <Button
        disabled={!hasPublished}
        fontSize={1}
        mode="ghost"
        text="Unpublish"
        onClick={() => void apply(unpublishDocument(handle))}
      />
      <Button
        disabled={!hasDraft}
        fontSize={1}
        tone="positive"
        text="Publish"
        onClick={() => void apply(publishDocument(handle))}
      />
    </Flex>
  )
}

function EditorPane({handle}: {handle: ArticleHandle}): JSX.Element {
  const {data: title} = useDocument<string>({...handle, path: 'title'})

  return (
    <VStack gap={4}>
      <Flex alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Text size={2} weight="semibold">
          {title || 'Untitled'}
        </Text>
        <EditorActions handle={handle} />
      </Flex>
      <TextField handle={handle} field="title" label="Title" />
      <TextField handle={handle} field="subtitle" label="Subtitle" />
    </VStack>
  )
}

function ExpandButton({
  event,
  expanded,
  onToggle,
}: {
  event: DocumentHistoryEvent
  expanded: boolean
  onToggle: (id: string) => void
}): JSX.Element | null {
  if (!isExpandable(event)) return null
  return (
    <IconButton
      aria-label={expanded ? 'Collapse edits' : 'Show edits'}
      icon={expanded ? ChevronDownIcon : ChevronRightIcon}
      onClick={() => onToggle(event.id)}
    />
  )
}

function EventItem({
  event,
  userNames,
  expanded,
  onToggleExpand,
}: {
  event: DocumentHistoryEvent
  userNames: Map<string, string>
  expanded: boolean
  onToggleExpand: (id: string) => void
}): JSX.Element {
  const {label, tone} = EVENT_LABELS[event.type]
  const author = resolveAuthorName(event.author, userNames)
  const indent = getParentId(event) ? 4 : 0

  return (
    <Box paddingLeft={indent} paddingY={1}>
      <Flex alignItems="center" justifyContent="space-between" gap={2}>
        <Flex alignItems="center" gap={2}>
          <Indicator label={label} tone={tone} />
          <VStack gap={1}>
            <Text size={1} weight="medium">
              {getEventTitle(event)}
            </Text>
            <Text muted size={0}>
              {author} · {formatTime(event.timestamp)}
            </Text>
          </VStack>
        </Flex>
        <ExpandButton event={event} expanded={expanded} onToggle={onToggleExpand} />
      </Flex>
    </Box>
  )
}

function HistoryList({
  documentId,
  perspective,
}: {
  documentId: string
  perspective: TimelineTab
}): JSX.Element {
  const {events, hasMore, isPending, loadMore, expandEvent} = useDocumentHistory({
    documentId,
    documentType: DOCUMENT_TYPE,
    perspective,
  })
  const {data: users} = useUsers()
  const userNames = useMemo(() => buildUserDisplayMap(users), [users])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const visibleEvents = events.filter((ev) => {
    const parentId = getParentId(ev)
    return !parentId || expandedIds.has(parentId)
  })

  const toggleExpand = async (id: string) => {
    if (expandedIds.has(id)) {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      return
    }
    await expandEvent(id)
    setExpandedIds((prev) => new Set(prev).add(id))
  }

  if (visibleEvents.length === 0) {
    return (
      <Text muted size={1}>
        No history events yet
      </Text>
    )
  }

  return (
    <VStack gap={2}>
      {visibleEvents.map((event) => (
        <EventItem
          key={event.id}
          event={event}
          userNames={userNames}
          expanded={expandedIds.has(event.id)}
          onToggleExpand={(id) => void toggleExpand(id)}
        />
      ))}
      <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
    </VStack>
  )
}

function HistoryPane({documentId}: {documentId: string}): JSX.Element {
  const [perspective, setPerspective] = useState<TimelineTab>('drafts')

  return (
    <VStack gap={3}>
      <Flex alignItems="center" justifyContent="space-between" gap={2}>
        <Text size={1} weight="semibold">
          History
        </Text>
        <Select
          aria-label="History perspective"
          fontSize={1}
          value={perspective}
          onChange={(e) =>
            setPerspective(e.currentTarget.value === 'published' ? 'published' : 'drafts')
          }
        >
          <option value="drafts">Draft</option>
          <option value="published">Published</option>
        </Select>
      </Flex>
      <Suspense fallback={<Spinner />}>
        <HistoryList documentId={documentId} perspective={perspective} />
      </Suspense>
    </VStack>
  )
}

function WorkspaceBody({activeId}: {activeId: string | null}): JSX.Element {
  if (!activeId) {
    return (
      <Box padding={4}>
        <Text align="center" muted size={1}>
          Create an article to see its history
        </Text>
      </Box>
    )
  }

  const handle = createDocumentHandle({documentId: activeId, documentType: DOCUMENT_TYPE})

  return (
    <Flex>
      <Box flexGrow={1} padding={4}>
        <Suspense fallback={<Spinner />}>
          <EditorPane key={activeId} handle={handle} />
        </Suspense>
      </Box>
      <Box borderLeft padding={3} style={{flex: '0 0 320px'}}>
        <HistoryPane key={activeId} documentId={activeId} />
      </Box>
    </Flex>
  )
}

function DocumentHistoryWorkspace(): JSX.Element {
  const {data: articles} = useDocuments({
    documentType: DOCUMENT_TYPE,
    batchSize: 20,
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const createArticle = useCreateDocument({documentType: DOCUMENT_TYPE})

  const activeId = selectedId ?? articles[0]?.documentId ?? null

  const handleCreate = async () => {
    const handle = await createArticle()
    setSelectedId(handle.documentId)
  }

  return (
    <Card>
      <Flex>
        <ArticlePickerSidebar
          articles={articles}
          activeId={activeId}
          onSelect={setSelectedId}
          onCreate={() => void handleCreate()}
        />
        <Box flexGrow={1}>
          <WorkspaceBody activeId={activeId} />
        </Box>
      </Flex>
    </Card>
  )
}

export function DocumentHistoryRoute(): JSX.Element {
  return (
    <PageLayout
      icon={ClockIcon}
      title="Document history"
      subtitle="Edit, publish, or discard an article and watch its history update live"
    >
      <Suspense fallback={<Spinner />}>
        <DocumentHistoryWorkspace />
      </Suspense>
    </PageLayout>
  )
}
