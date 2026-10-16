import {
  createDocument,
  type DocumentHandle,
  getDocumentKey,
  type PerspectiveHandle,
  ResourceProvider,
  useActiveReleases,
  useApplyDocumentActions,
  useDocument,
  useDocuments,
  useQuery,
} from '@sanity/sdk-react'
import {Button, Spinner, TextInput} from '@sanity/ui'
import {type JSX, Suspense, useState} from 'react'
import {Box, Card, Code, Flex, Heading, Text, VStack} from 'ui5'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {JsonDocumentEditor} from '../components/JsonDocumentEditor'
import {PageLayout} from '../components/PageLayout'
import {DocumentPreview} from '../DocumentCollection/DocumentPreview'
import {PerspectiveSelector} from './releases/PerspectiveSelector'

const DOCUMENT_TYPE = 'author'

function QueryPanel({
  title,
  documentId,
  testId,
}: {
  title: string
  documentId: string
  testId: string
}) {
  const {data} = useQuery<Record<string, unknown> | null>({
    query: '*[_id == $id][0]{_id, _originalId, _system, name}',
    params: {id: documentId},
  })

  return (
    <Card data-testid={`panel-${testId}`} density="regular">
      <VStack gap={3}>
        <Heading size={1} as="h2">
          {title}
        </Heading>
        <Box padding={3}>
          <Code data-testid={`panel-${testId}-json`}>{JSON.stringify(data ?? null, null, 2)}</Code>
        </Box>
      </VStack>
    </Card>
  )
}

/**
 * The bundle a handle writes to, as the document store derives it from the
 * perspective. Never the published bundle: like non-variant edits, the
 * 'published' perspective writes to 'drafts'.
 */
function getBundleId(perspective: DocumentHandle['perspective']): string {
  return typeof perspective === 'object' && perspective && 'releaseName' in perspective
    ? perspective.releaseName
    : 'drafts'
}

/**
 * Whether the document a variant handle resolved to is that variant in the
 * handle's bundle, rather than a fallback (the variant over published, or the
 * base document). The resolved document's `_system` says which it is.
 */
function isVariantInBundle(document: unknown, handle: DocumentHandle & {variant: string}): boolean {
  // the kitchensink's generated document types predate `_system`
  const system = (document as {_system?: {variant?: {_ref: string}; bundleId?: string}} | null)
    ?._system
  // a published variant has no bundleId and so never matches
  return (
    system?.variant?._ref === `_.variants.${handle.variant}` &&
    system.bundleId === getBundleId(handle.perspective)
  )
}

/**
 * The editor for a variant handle. Until the variant exists in the selected
 * bundle the editor shows the fallback document read-only and offers to
 * create the variant instead, so a stray keystroke can't create it by accident.
 */
function VariantEditor({handle}: {handle: DocumentHandle & {variant: string}}) {
  const {data: document} = useDocument(handle)
  const apply = useApplyDocumentActions()
  const exists = isVariantInBundle(document, handle)

  return (
    <>
      {!exists && (
        <Button
          data-testid="create-variant"
          fontSize={1}
          text={`Create variant "${handle.variant}" in ${getBundleId(handle.perspective)}`}
          onClick={() => apply(createDocument(handle))}
        />
      )}
      <JsonDocumentEditor
        key={getDocumentKey(handle)}
        documentHandle={handle}
        minHeight="240px"
        readOnly={!exists}
      />
    </>
  )
}

/** A query panel and an editor for one handle; perspective and variant come from context. */
function DocumentColumn({
  title,
  handle,
  testId,
}: {
  title: string
  handle: DocumentHandle
  testId: string
}) {
  return (
    <Box flexGrow={1} style={{minWidth: 320}}>
      <VStack gap={3}>
        <Suspense>
          <QueryPanel title={title} documentId={handle.documentId} testId={testId} />
        </Suspense>
        <Suspense fallback={<>&hellip;</>}>
          {handle.variant ? (
            // the key stays stable while a pending variant has no _id yet
            <VariantEditor handle={{...handle, variant: handle.variant}} />
          ) : (
            <JsonDocumentEditor documentHandle={handle} minHeight="240px" />
          )}
        </Suspense>
      </VStack>
    </Box>
  )
}

/** Lists every subject document of `DOCUMENT_TYPE` in the given perspective, for picking one. */
function SubjectDocumentList({
  perspective,
  onSelectDocument,
}: {
  perspective: PerspectiveHandle['perspective']
  onSelectDocument: (handle: DocumentHandle) => void
}): JSX.Element {
  const {data: handles} = useDocuments({
    perspective,
    filter: '_type == $type',
    params: {type: DOCUMENT_TYPE},
    orderings: [{field: '_updatedAt', direction: 'desc'}],
    batchSize: 10,
  })

  return (
    <VStack gap={2} data-testid="subject-document-list">
      <Text size={1} weight="semibold">
        Subject document
      </Text>
      <DocumentListLayout>
        {handles.map((handle) => (
          <DocumentPreview
            {...handle}
            key={handle.documentId}
            onClick={() => onSelectDocument(handle)}
          />
        ))}
      </DocumentListLayout>
    </VStack>
  )
}

function Controls({
  variant,
  onVariantChange,
  selectedDocumentId,
}: {
  variant: string | undefined
  onVariantChange: (next: string) => void
  selectedDocumentId: string | undefined
}): JSX.Element {
  return (
    <Flex gap={4} alignItems="center" flexWrap="wrap">
      <Flex gap={2} alignItems="center">
        <Text size={1} weight="semibold">
          Variant
        </Text>
        <TextInput
          data-testid="variant-input"
          fontSize={1}
          value={variant}
          onChange={(event) => onVariantChange(event.currentTarget.value)}
        />
      </Flex>
      <Text size={1} muted>
        Selected {DOCUMENT_TYPE}: <Code as="span">{selectedDocumentId ?? 'none'}</Code>
      </Text>
    </Flex>
  )
}

/** The base and variant columns for one subject document, nested under the shared perspective. */
function VariantColumns({
  handle,
  perspective,
  variant,
}: {
  handle: DocumentHandle
  perspective: PerspectiveHandle['perspective']
  variant: string
}): JSX.Element {
  return (
    <ResourceProvider perspective={perspective} fallback={null}>
      <Flex gap={4} flexWrap="wrap">
        <DocumentColumn title="Base" handle={{...handle, perspective}} testId="base" />
        <ResourceProvider variant={variant} fallback={null}>
          <DocumentColumn
            title={`Variant: ${variant}`}
            handle={{...handle, perspective, variant}}
            testId="variant"
          />
        </ResourceProvider>
      </Flex>
    </ResourceProvider>
  )
}

/**
 * Demonstrates variant support end to end: the same query under two nested
 * ResourceProviders that differ only in variant, and an editor bound to a
 * variant handle. Both columns share the selected perspective, so a release
 * can be combined with a variant. The variant editor is read-only until the
 * variant is created in the selected bundle; once created, its `_id` is
 * absent until the remote announces it, so the React key comes from
 * `getDocumentKey` instead.
 *
 * The subject document is picked from a list of every `DOCUMENT_TYPE`
 * document in the selected perspective.
 *
 * Requires a dataset with a variant definition (`_.variants.<name>`).
 */
export function VariantsRoute(): JSX.Element {
  const [variant, setVariant] = useState<string | undefined>()
  const [handle, setHandle] = useState<DocumentHandle | undefined>()

  const [selectedPerspective, setSelectedPerspective] = useState<PerspectiveHandle>({
    perspective: 'drafts',
  })

  const {perspective} = selectedPerspective
  const activeReleases = useActiveReleases()

  return (
    <PageLayout title="Variants Demo" subtitle="Same query and editor, base versus variant">
      <VStack gap={4}>
        <Text size={1} muted>
          Both columns are wrapped in a ResourceProvider carrying the selected perspective. The
          right column is additionally wrapped in one carrying a variant, and reads and edits that
          variant of the same document. Neither column passes perspective or variant to a hook
          directly.
        </Text>
        <Controls
          variant={variant}
          onVariantChange={setVariant}
          selectedDocumentId={handle?.documentId}
        />
        <PerspectiveSelector
          selectedPerspective={selectedPerspective}
          onPerspectiveSelect={setSelectedPerspective}
          activeReleases={activeReleases}
        />
        <Suspense fallback={<Spinner />}>
          <SubjectDocumentList perspective={perspective} onSelectDocument={setHandle} />
        </Suspense>
        {handle && variant && (
          <VariantColumns handle={handle} perspective={perspective} variant={variant} />
        )}
      </VStack>
    </PageLayout>
  )
}
