import {AddIcon} from '@sanity/icons/Add'
import {DocumentIcon} from '@sanity/icons/Document'
import {
  createDocumentHandle,
  discardDocument,
  type DocumentHandle,
  type DocumentStatus,
  publishDocument,
  unpublishDocument,
  useApplyDocumentActions,
  useCreateDocument,
  useDocument,
  useDocumentProjection,
  useDocuments,
  useEditDocument,
} from '@sanity/sdk-react'
import {Button, TextInput} from '@sanity/ui'
import {type JSX, Suspense, useId, useState} from 'react'
import {
  Box,
  Card,
  Flex,
  Icon,
  IconButton,
  Indicator,
  IndicatorStack,
  List,
  Spinner,
  Text,
  VStack,
} from 'ui5'

import {LoadMore} from './LoadMore'

const DOCUMENT_TYPE = 'article'
// Shared by the list and the form so the selected document has a single projection subscription.
const PROJECTION = '{title, subtitle}'

type ArticleHandle = DocumentHandle<typeof DOCUMENT_TYPE>

interface ArticlePreview {
  title?: string
  subtitle?: string
}

function createArticleHandle(documentId: string): ArticleHandle {
  return createDocumentHandle({documentId, documentType: DOCUMENT_TYPE})
}

function StatusIndicators({lastEditedDraftAt, lastEditedPublishedAt}: DocumentStatus): JSX.Element {
  return (
    <IndicatorStack>
      {lastEditedDraftAt && <Indicator label="Draft" tone="caution" />}
      {lastEditedPublishedAt && <Indicator label="Published" tone="positive" />}
    </IndicatorStack>
  )
}

function ArticleListItem({
  handle,
  onSelect,
  selected,
}: {
  handle: ArticleHandle
  onSelect: (documentId: string) => void
  selected: boolean
}): JSX.Element {
  const {data} = useDocumentProjection<ArticlePreview>({...handle, projection: PROJECTION})

  return (
    <List.Item>
      <List.ItemButton
        current={selected}
        end={<StatusIndicators {...data._status} />}
        onClick={() => onSelect(handle.documentId)}
        start={<Icon aria-hidden icon={DocumentIcon} />}
        subtext={data.subtitle}
        text={data.title || 'Untitled'}
      />
    </List.Item>
  )
}

function ArticleList({
  articles,
  hasMore,
  isPending,
  onCreate,
  onLoadMore,
  onSelect,
  selectedId,
}: {
  articles: ArticleHandle[]
  hasMore: boolean
  isPending: boolean
  onCreate: () => void
  onLoadMore: () => void
  onSelect: (documentId: string) => void
  selectedId: string | null
}): JSX.Element {
  return (
    <VStack gap={3}>
      <Flex alignItems="center" justifyContent="space-between">
        <Text size={1} weight="semibold">
          Articles
        </Text>
        <IconButton aria-label="Create new article" icon={AddIcon} onClick={onCreate} />
      </Flex>
      {articles.length === 0 ? (
        <Text align="center" muted size={1}>
          {isPending ? 'Loading articles…' : 'No articles'}
        </Text>
      ) : (
        <List>
          {articles.map((handle) => (
            <Suspense key={handle.documentId} fallback={<Spinner />}>
              <ArticleListItem
                handle={handle}
                onSelect={onSelect}
                selected={handle.documentId === selectedId}
              />
            </Suspense>
          ))}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={onLoadMore} />
        </List>
      )}
    </VStack>
  )
}

function ArticleField({
  field,
  handle,
  label,
}: {
  field: keyof ArticlePreview
  handle: ArticleHandle
  label: string
}): JSX.Element {
  const {data} = useDocument<string>({...handle, path: field})
  const setValue = useEditDocument<string>({...handle, path: field})
  const inputId = useId()

  return (
    <VStack gap={2}>
      <Text as="label" htmlFor={inputId} size={1} weight="semibold">
        {label}
      </Text>
      <TextInput
        id={inputId}
        onChange={(event) => void setValue(event.currentTarget.value)}
        value={data ?? ''}
      />
    </VStack>
  )
}

function ArticleActions({
  handle,
  hasDraft,
  hasPublished,
  showAllActions,
}: {
  handle: ArticleHandle
  hasDraft: boolean
  hasPublished: boolean
  showAllActions: boolean
}): JSX.Element {
  const apply = useApplyDocumentActions()

  return (
    <Flex gap={2}>
      {showAllActions && (
        <>
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
        </>
      )}
      <Button
        disabled={!hasDraft}
        fontSize={1}
        onClick={() => void apply(publishDocument(handle))}
        text="Publish"
        tone="positive"
      />
    </Flex>
  )
}

function ArticleForm({
  handle,
  showAllActions,
}: {
  handle: ArticleHandle
  showAllActions: boolean
}): JSX.Element {
  // Read the title from local document state so the heading tracks the input as you type.
  const {data: title} = useDocument<string>({...handle, path: 'title'})
  const {data} = useDocumentProjection<ArticlePreview>({...handle, projection: PROJECTION})

  return (
    <VStack gap={4}>
      <Flex alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Text size={2} weight="semibold">
          {title || 'Untitled'}
        </Text>
        <ArticleActions
          handle={handle}
          hasDraft={Boolean(data._status?.lastEditedDraftAt)}
          hasPublished={Boolean(data._status?.lastEditedPublishedAt)}
          showAllActions={showAllActions}
        />
      </Flex>
      <ArticleField field="title" handle={handle} label="Title" />
      <ArticleField field="subtitle" handle={handle} label="Subtitle" />
    </VStack>
  )
}

function ArticleWorkspaceBody({
  activeId,
  renderSidePanel,
  showAllActions,
}: {
  activeId: string | null
  renderSidePanel?: (handle: ArticleHandle) => JSX.Element
  showAllActions: boolean
}): JSX.Element {
  if (!activeId) {
    return (
      <Box padding={4}>
        <Text align="center" muted size={1}>
          Select an article or create a new one
        </Text>
      </Box>
    )
  }

  const handle = createArticleHandle(activeId)

  return (
    <Flex>
      <Box flexGrow={1} padding={4}>
        <Suspense fallback={<Spinner />}>
          <ArticleForm key={activeId} handle={handle} showAllActions={showAllActions} />
        </Suspense>
      </Box>
      {renderSidePanel && (
        <Box borderLeft padding={3} style={{flex: '0 0 320px'}}>
          <Suspense key={activeId} fallback={<Spinner />}>
            {renderSidePanel(handle)}
          </Suspense>
        </Box>
      )}
    </Flex>
  )
}

function useAutoSelectedId(
  candidateId: string | undefined,
  enabled: boolean,
): [string | null, (documentId: string) => void] {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  if (!selectedId && enabled && candidateId) {
    setSelectedId(candidateId)
  }
  return [selectedId, setSelectedId]
}

/**
 * Shared article list and editor workspace used by demo routes that pair editing with
 * other features (such as Studio demo and Document History).
 */
export function ArticleWorkspace({
  autoSelectFirst,
  renderSidePanel,
  showAllActions,
}: {
  autoSelectFirst?: boolean
  renderSidePanel?: (handle: ArticleHandle) => JSX.Element
  showAllActions?: boolean
}): JSX.Element {
  const {
    data: articles,
    hasMore,
    isPending,
    loadMore,
  } = useDocuments({
    documentType: DOCUMENT_TYPE,
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })
  const [selectedId, setSelectedId] = useAutoSelectedId(
    articles[0]?.documentId,
    Boolean(autoSelectFirst),
  )
  const createArticle = useCreateDocument({documentType: DOCUMENT_TYPE})

  const sidebarWidth = renderSidePanel ? '0 0 240px' : '0 0 320px'

  const handleCreate = async () => {
    const handle = await createArticle()
    setSelectedId(handle.documentId)
  }

  return (
    <Card>
      <Flex>
        <Box borderRight padding={3} style={{flex: sidebarWidth}}>
          <ArticleList
            articles={articles}
            hasMore={hasMore}
            isPending={isPending}
            onCreate={() => void handleCreate()}
            onLoadMore={loadMore}
            onSelect={setSelectedId}
            selectedId={selectedId}
          />
        </Box>
        <Box flexGrow={1}>
          <ArticleWorkspaceBody
            activeId={selectedId}
            renderSidePanel={renderSidePanel}
            showAllActions={Boolean(showAllActions)}
          />
        </Box>
      </Flex>
    </Card>
  )
}
