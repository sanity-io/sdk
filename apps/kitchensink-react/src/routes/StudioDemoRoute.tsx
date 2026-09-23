import {AddIcon} from '@sanity/icons/Add'
import {DocumentIcon} from '@sanity/icons/Document'
import {
  createDocumentHandle,
  type DocumentHandle,
  publishDocument,
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

import {LoadMore} from '../components/LoadMore'
import {PageLayout} from '../components/PageLayout'

const DOCUMENT_TYPE = 'article'
// Shared by the list and the form so the selected document has a single projection subscription.
const PROJECTION = '{title, subtitle}'

type ArticleHandle = DocumentHandle<typeof DOCUMENT_TYPE>

interface ArticlePreview {
  title?: string
  subtitle?: string
  // Projections include the document's draft/published status alongside the projected fields.
  _status?: {
    lastEditedDraftAt?: string
    lastEditedPublishedAt?: string
  }
}

function createArticleHandle(documentId: string): ArticleHandle {
  return createDocumentHandle({documentId, documentType: DOCUMENT_TYPE})
}

function StatusIndicators({
  lastEditedDraftAt,
  lastEditedPublishedAt,
}: NonNullable<ArticlePreview['_status']>): JSX.Element {
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
    <List.ButtonItem
      end={<StatusIndicators {...data._status} />}
      onClick={() => onSelect(handle.documentId)}
      selected={selected}
      start={<Icon aria-hidden icon={DocumentIcon} />}
    >
      <List.ItemText title={data.title || 'Untitled'} subtitle={data.subtitle} />
    </List.ButtonItem>
  )
}

function ArticleList({
  onCreate,
  onSelect,
  selectedId,
}: {
  onCreate: () => void
  onSelect: (documentId: string) => void
  selectedId: string | null
}): JSX.Element {
  const {data, hasMore, isPending, loadMore} = useDocuments({
    documentType: DOCUMENT_TYPE,
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })

  return (
    <VStack gap={3}>
      <Flex alignItems="center" justifyContent="space-between">
        <Text size={1} weight="semibold">
          Articles
        </Text>
        <IconButton aria-label="Create new article" icon={AddIcon} onClick={onCreate} />
      </Flex>
      {data.length === 0 ? (
        <Text align="center" muted size={1}>
          {isPending ? 'Loading articles…' : 'No articles'}
        </Text>
      ) : (
        <List>
          {data.map((handle) => (
            <Suspense key={handle.documentId} fallback={<Spinner />}>
              <ArticleListItem
                handle={handle}
                onSelect={onSelect}
                selected={handle.documentId === selectedId}
              />
            </Suspense>
          ))}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
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
  field: keyof Omit<ArticlePreview, '_status'>
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
        onChange={(event) => setValue(event.currentTarget.value)}
        value={data ?? ''}
      />
    </VStack>
  )
}

function ArticleForm({handle}: {handle: ArticleHandle}): JSX.Element {
  // Read the title from local document state so the heading tracks the input as you type.
  const {data: title} = useDocument<string>({...handle, path: 'title'})
  const {data} = useDocumentProjection<ArticlePreview>({...handle, projection: PROJECTION})
  const apply = useApplyDocumentActions()

  return (
    <VStack gap={4}>
      <Flex alignItems="center" justifyContent="space-between">
        <Text size={2} weight="semibold">
          {title || 'Untitled'}
        </Text>
        <Button
          disabled={!data._status?.lastEditedDraftAt}
          fontSize={1}
          onClick={() => apply(publishDocument(handle))}
          text="Publish"
          tone="positive"
        />
      </Flex>
      <ArticleField field="title" handle={handle} label="Title" />
      <ArticleField field="subtitle" handle={handle} label="Subtitle" />
    </VStack>
  )
}

export function StudioDemoRoute(): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const createArticle = useCreateDocument({documentType: DOCUMENT_TYPE})

  const handleCreate = async () => {
    const handle = await createArticle()
    setSelectedId(handle.documentId)
  }

  return (
    <PageLayout
      icon={DocumentIcon}
      title="Studio"
      subtitle="A minimal document list and form, like Sanity Studio"
    >
      <Card>
        <Flex>
          <Box borderRight padding={3} style={{flex: '0 0 320px'}}>
            <ArticleList onCreate={handleCreate} onSelect={setSelectedId} selectedId={selectedId} />
          </Box>
          <Box flexGrow={1} padding={4}>
            {selectedId ? (
              <Suspense fallback={<Spinner />}>
                <ArticleForm key={selectedId} handle={createArticleHandle(selectedId)} />
              </Suspense>
            ) : (
              <Text align="center" muted size={1}>
                Select an article or create a new one
              </Text>
            )}
          </Box>
        </Flex>
      </Card>
    </PageLayout>
  )
}
