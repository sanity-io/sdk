import {ChevronDownIcon} from '@sanity/icons/ChevronDown'
import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {
  type DocumentHandle,
  type DocumentHistoryEvent,
  type DocumentHistoryEventType,
  type ExpandableDocumentHistoryEvent,
  isExpandableHistoryEvent,
  useDocumentHistoryEventEdits,
  useDocumentsHistory,
  useUsers,
} from '@sanity/sdk-react'
import {Select} from '@sanity/ui'
import {type JSX, Suspense, useMemo, useState} from 'react'
import {Box, Flex, IconButton, Indicator, Spinner, Text, VStack} from 'ui5'

import {LoadMore} from '../../components/LoadMore'

type TimelineTab = 'drafts' | 'published' | 'both'
type IndicatorTone = 'positive' | 'caution' | 'critical' | 'neutral'

function parseTimelineTab(value: string): TimelineTab {
  if (value === 'published' || value === 'both') return value
  return 'drafts'
}

/**
 * Self-contained example of reading a document's history timeline with
 * {@link useDocumentsHistory} and lazily expanding grouped edits with
 * {@link useDocumentHistoryEventEdits}.
 */
export function DocumentHistoryPanel({handle}: {handle: DocumentHandle}): JSX.Element {
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
          onChange={(e) => setPerspective(parseTimelineTab(e.currentTarget.value))}
        >
          <option value="drafts">Draft</option>
          <option value="published">Published</option>
          <option value="both">Draft + Published</option>
        </Select>
      </Flex>
      <Suspense fallback={<Spinner />}>
        <HistoryList handle={handle} perspective={perspective} />
      </Suspense>
    </VStack>
  )
}

function HistoryList({
  handle,
  perspective,
}: {
  handle: DocumentHandle
  perspective: TimelineTab
}): JSX.Element {
  const documents = useMemo(
    () =>
      perspective === 'both'
        ? [
            {...handle, perspective: 'drafts' as const},
            {...handle, perspective: 'published' as const},
          ]
        : [{...handle, perspective}],
    [handle, perspective],
  )
  const {data: events, hasMore, isPending, loadMore} = useDocumentsHistory({documents})
  const {data: users} = useUsers()
  const userNames = useMemo(() => buildUserDisplayMap(users), [users])

  if (events.length === 0) {
    return (
      <Text muted size={1}>
        No history events yet
      </Text>
    )
  }

  return (
    <VStack gap={2}>
      {events.map((event) => (
        <EventItem key={event.id} event={event} userNames={userNames} />
      ))}
      <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
    </VStack>
  )
}

function EventItem({
  event,
  userNames,
}: {
  event: DocumentHistoryEvent
  userNames: Map<string, string>
}): JSX.Element {
  if (isExpandableHistoryEvent(event)) {
    return <ExpandableEventItem event={event} userNames={userNames} />
  }
  return <EventRow event={event} userNames={userNames} />
}

function ExpandableEventItem({
  event,
  userNames,
}: {
  event: ExpandableDocumentHistoryEvent
  userNames: Map<string, string>
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <VStack gap={1}>
      <EventRow
        event={event}
        userNames={userNames}
        action={
          <IconButton
            aria-label={expanded ? 'Collapse edits' : 'Show edits'}
            icon={expanded ? ChevronDownIcon : ChevronRightIcon}
            onClick={() => setExpanded((prev) => !prev)}
          />
        }
      />
      {expanded && (
        <Suspense
          fallback={
            <Box paddingLeft={4} paddingY={1}>
              <Spinner />
            </Box>
          }
        >
          <ExpandedEventEdits event={event} userNames={userNames} />
        </Suspense>
      )}
    </VStack>
  )
}

function ExpandedEventEdits({
  event,
  userNames,
}: {
  event: ExpandableDocumentHistoryEvent
  userNames: Map<string, string>
}): JSX.Element {
  const {data: edits} = useDocumentHistoryEventEdits({event})

  return (
    <Box paddingLeft={4}>
      <VStack gap={1}>
        {edits.map((child) => (
          <EventRow key={child.id} event={child} userNames={userNames} />
        ))}
      </VStack>
    </Box>
  )
}

function EventRow({
  event,
  userNames,
  action,
}: {
  event: DocumentHistoryEvent
  userNames: Map<string, string>
  action?: JSX.Element | null
}): JSX.Element {
  const {label, tone} = EVENT_LABELS[event.type]
  const author = resolveAuthorName(event.author, userNames)

  return (
    <Box paddingY={1}>
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
        {action}
      </Flex>
    </Box>
  )
}

const EVENT_LABELS: Record<DocumentHistoryEventType, {label: string; tone: IndicatorTone}> = {
  created: {label: 'Created', tone: 'neutral'},
  edited: {label: 'Edited', tone: 'caution'},
  published: {label: 'Published', tone: 'positive'},
  unpublished: {label: 'Unpublished', tone: 'caution'},
  discarded: {label: 'Discarded', tone: 'critical'},
  deleted: {label: 'Deleted', tone: 'critical'},
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

function getEventTitle(event: DocumentHistoryEvent): string {
  const {label} = EVENT_LABELS[event.type]
  if (event.type !== 'edited') return label
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
