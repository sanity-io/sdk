import {
  type DocumentHandle,
  PerspectiveHandle,
  ReleasePerspective,
  useActiveReleases,
  useAllReleases,
  useDocument,
  useDocumentPreview,
  useDocumentProjection,
  useDocuments,
  usePerspective,
} from '@sanity/sdk-react'
import {Box, Button, Card, Dialog, Flex, Heading, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {type JSX, Suspense, useEffect, useMemo, useState} from 'react'

import {DocumentEditorPanel} from '../../components/DocumentEditorPanel'
import {DocumentListLayout} from '../../components/DocumentListLayout/DocumentListLayout'
import {JsonDocumentEditor} from '../../components/JsonDocumentEditor'
import {DocumentPreview} from '../../DocumentCollection/DocumentPreview'
import {isE2E} from '../../sanityConfigs'
import {ReleaseActionsDialog} from './ReleaseActionsDialog'
import {ReleasesAutocomplete} from './ReleasesAutocomplete'
import {isReleasePerspective} from './util'

const DEFAULT_PERSPECTIVES = [
  {name: 'raw', title: 'Raw', description: 'View all document versions'},
  {name: 'published', title: 'Published', description: 'View published content'},
  {name: 'drafts', title: 'Drafts', description: 'View draft content'},
] as const

function DocumentListContent({
  perspective,
  onSelectDocument,
}: {
  perspective: PerspectiveHandle
  onSelectDocument: (doc: DocumentHandle) => void
}) {
  const perspectiveData = usePerspective(perspective)
  const {data} = useDocuments({
    ...perspective,
    filter: '_type==$type',
    params: {type: 'author'},
    orderings: [{field: '_updatedAt', direction: 'desc'}],
    batchSize: 5,
  })

  return (
    <div>
      <p>Documents in perspective: {JSON.stringify(perspectiveData)}</p>
      <DocumentListLayout>
        {data.map((docHandle: DocumentHandle) => (
          <DocumentPreview
            {...docHandle}
            key={docHandle.documentId}
            onClick={() => onSelectDocument(docHandle)}
          />
        ))}
      </DocumentListLayout>
    </div>
  )
}

function DocumentList({
  perspective,
  onSelectDocument,
}: {
  perspective: PerspectiveHandle
  onSelectDocument: (doc: DocumentHandle) => void
  selectedDocumentId?: string
}) {
  return (
    <Suspense fallback={<Spinner />}>
      <DocumentListContent perspective={perspective} onSelectDocument={onSelectDocument} />
    </Suspense>
  )
}

function DefaultPerspectiveCard({
  perspective,
  isSelected,
  onClick,
}: {
  perspective: (typeof DEFAULT_PERSPECTIVES)[number]
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <Card
      padding={3}
      radius={2}
      shadow={1}
      tone="default"
      style={{cursor: 'pointer'}}
      onClick={onClick}
      border={isSelected}
    >
      <Flex align="center" gap={3}>
        <Box flex={1}>
          <Text size={1} weight="semibold">
            {perspective.title}
          </Text>
          <Box paddingTop={1}>
            <Text size={0} muted>
              {perspective.description}
            </Text>
          </Box>
        </Box>
      </Flex>
    </Card>
  )
}

function DocumentData({
  documentOptions,
  documentProjectionOptions,
}: {
  documentOptions: DocumentHandle
  documentProjectionOptions: DocumentHandle & {projection: string}
}) {
  const documentResult = useDocument(documentOptions)
  const previewResult = useDocumentPreview(documentOptions)
  const projectionResult = useDocumentProjection(documentProjectionOptions)

  return (
    <Stack space={4}>
      <Card padding={4} radius={2} shadow={1} tone="primary" data-testid="document-data-card">
        <Heading as="h3" size={2} style={{marginBottom: 8}}>
          Selected Document Data
        </Heading>
        <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
          {JSON.stringify(documentResult.data, null, 2)}
        </pre>
      </Card>

      <Card padding={4} radius={2} shadow={1} tone="primary" data-testid="document-preview-card">
        <Heading as="h3" size={2} style={{marginBottom: 8}}>
          Document Preview
        </Heading>
        <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
          {JSON.stringify(previewResult.data, null, 2)}
        </pre>
      </Card>

      <Card padding={4} radius={2} shadow={1} tone="primary" data-testid="document-projection-card">
        <Heading as="h3" size={2} style={{marginBottom: 8}}>
          Document Projection
        </Heading>
        <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
          {JSON.stringify(projectionResult.data, null, 2)}
        </pre>
      </Card>
    </Stack>
  )
}

function ReleasesContent({
  selectedPerspective,
  onPerspectiveSelect,
  selectedDocument,
  onDocumentIdSubmit,
}: {
  selectedPerspective: PerspectiveHandle
  onPerspectiveSelect: (perspective: PerspectiveHandle) => void
  selectedDocument: DocumentHandle
  onDocumentIdSubmit: (documentId: string) => void
}) {
  const [releaseDialog, setReleaseDialog] = useState<
    {mode: 'create'} | {mode: 'edit'; releaseName: string} | null
  >(null)
  // After creating a release, defer switching the perspective until the
  // listener has delivered it into useActiveReleases — otherwise
  // getPerspectiveState throws "not found in active releases".
  const [pendingPerspectiveSwitch, setPendingPerspectiveSwitch] = useState<string | null>(null)
  const activeReleases = useActiveReleases()
  // useAllReleases includes archived/published so a release stays visible
  // through its full lifecycle in the management UI (selected card + dialog).
  const allReleases = useAllReleases()
  const calculatedPerspective = usePerspective(selectedPerspective)

  useEffect(() => {
    if (!pendingPerspectiveSwitch) return
    if (activeReleases.some((r) => r.name === pendingPerspectiveSwitch)) {
      onPerspectiveSelect({perspective: {releaseName: pendingPerspectiveSwitch}})
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingPerspectiveSwitch(null)
    }
  }, [pendingPerspectiveSwitch, activeReleases, onPerspectiveSelect])
  const selectedReleaseDocument = allReleases.find(
    (release) =>
      release.name === (selectedPerspective.perspective as ReleasePerspective).releaseName,
  )

  const documentOptions = useMemo(
    () => ({...selectedDocument, perspective: selectedPerspective.perspective}),
    [selectedDocument, selectedPerspective],
  )
  const documentProjectionOptions = useMemo(
    () => ({
      ...documentOptions,
      projection: `{name, "bestFriend": bestFriend->name}`,
    }),
    [documentOptions],
  )

  return (
    <>
      <Box>
        <Text size={1} weight="semibold" style={{marginBottom: '8px'}}>
          Default Perspectives
        </Text>
        <Stack space={2}>
          {DEFAULT_PERSPECTIVES.map((perspective) => (
            <DefaultPerspectiveCard
              key={perspective.name}
              perspective={perspective}
              isSelected={
                !isReleasePerspective(selectedPerspective.perspective) &&
                selectedPerspective.perspective === perspective.name
              }
              onClick={() => onPerspectiveSelect({perspective: perspective.name})}
            />
          ))}
        </Stack>
      </Box>

      <Box>
        <Flex align="center" justify="space-between" style={{marginBottom: '8px'}}>
          <Text size={1} weight="semibold">
            Releases
          </Text>
          <Button
            text="Create release"
            tone="positive"
            fontSize={1}
            onClick={() => setReleaseDialog({mode: 'create'})}
          />
        </Flex>
        <ReleasesAutocomplete
          activeReleases={activeReleases}
          selectedPerspective={selectedPerspective}
          onSelectRelease={(releaseName) => {
            const release = activeReleases.find((r) => r.name === releaseName)
            if (release) {
              onPerspectiveSelect({perspective: {releaseName: release.name}})
            }
          }}
        />
      </Box>

      {selectedPerspective && (
        <Box>
          <Heading as="h2" size={3}>
            Selected Perspective
          </Heading>
          <Card padding={4} radius={2} shadow={1}>
            <pre>{JSON.stringify(calculatedPerspective, null, 2)}</pre>
          </Card>
        </Box>
      )}

      {selectedPerspective && (
        <Box>
          <Heading as="h2" size={3}>
            Document List in Selected{' '}
            {isReleasePerspective(selectedPerspective.perspective) ? 'Release' : 'Perspective'}
          </Heading>
          <DocumentList
            perspective={selectedPerspective}
            onSelectDocument={(doc) => onDocumentIdSubmit(doc.documentId)}
            selectedDocumentId={selectedDocument?.documentId}
          />
        </Box>
      )}

      <Box>
        <Heading as="h2" size={3}>
          View document across different perspectives
        </Heading>
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={3}>
            <TextInput
              value={selectedDocument?.documentId}
              onChange={(event) => onDocumentIdSubmit(event.currentTarget.value)}
              placeholder="Enter document ID"
            />
            <Button
              text="View Document"
              onClick={() => onDocumentIdSubmit(selectedDocument?.documentId || '')}
            />
          </Stack>
        </Card>
      </Box>

      {selectedDocument && (
        <Box paddingTop={4}>
          <Suspense fallback={<Spinner />}>
            <DocumentData
              documentOptions={documentOptions}
              documentProjectionOptions={documentProjectionOptions}
            />
          </Suspense>
        </Box>
      )}

      {selectedReleaseDocument && (
        <Box>
          <Flex align="center" justify="space-between">
            <Heading as="h2" size={3}>
              Selected Release Document
            </Heading>
            <Button
              text="Edit release"
              tone="primary"
              fontSize={1}
              onClick={() =>
                setReleaseDialog({mode: 'edit', releaseName: selectedReleaseDocument.name})
              }
            />
          </Flex>
          <pre data-testid="selected-release-document">
            {JSON.stringify(selectedReleaseDocument, null, 2)}
          </pre>
        </Box>
      )}

      {releaseDialog && (
        <ReleaseActionsDialog
          mode={releaseDialog.mode}
          release={
            releaseDialog.mode === 'edit'
              ? allReleases.find((r) => r.name === releaseDialog.releaseName)
              : undefined
          }
          onClose={() => setReleaseDialog(null)}
          onCreated={(releaseId) => {
            setPendingPerspectiveSwitch(releaseId)
            setReleaseDialog(null)
          }}
          onLeftActive={() => onPerspectiveSelect({perspective: 'drafts'})}
        />
      )}
    </>
  )
}

export function ReleasesRoute(): JSX.Element {
  const [selectedPerspective, setSelectedPerspective] = useState<PerspectiveHandle>({
    perspective: 'drafts',
  })
  const [selectedDocument, setSelectedDocument] = useState<DocumentHandle>({
    documentId: isE2E ? 'test-document-id' : '386584b0-237f-4870-849e-f71af8e6b269',
    documentType: 'author',
  })

  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const handlePerspectiveSelect = (perspective: PerspectiveHandle) => {
    setSelectedPerspective(perspective)
  }
  const handleDocumentIdSubmit = (documentId: string) => {
    setSelectedDocument({documentId, documentType: 'author'})
  }

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Heading as="h1" size={5}>
          Releases
        </Heading>

        <Suspense fallback={<Spinner />}>
          <ReleasesContent
            selectedPerspective={selectedPerspective}
            onPerspectiveSelect={handlePerspectiveSelect}
            selectedDocument={selectedDocument}
            onDocumentIdSubmit={handleDocumentIdSubmit}
          />
        </Suspense>

        {selectedDocument && (
          <Button
            text="Edit Document"
            tone="primary"
            fontSize={1}
            onClick={() => setIsEditorOpen(true)}
          />
        )}

        {isEditorOpen && (
          <Dialog
            header={`Edit Document: ${selectedDocument.documentId}`}
            id="releases-document-editor"
            onClose={() => setIsEditorOpen(false)}
            open={isEditorOpen}
            width={2}
          >
            <Box padding={4}>
              <Suspense fallback={<Spinner />}>
                <Stack space={4}>
                  <DocumentEditorPanel
                    docHandle={{...selectedDocument, perspective: selectedPerspective.perspective}}
                    onDocumentIdChange={handleDocumentIdSubmit}
                  />
                  <JsonDocumentEditor
                    documentHandle={{
                      ...selectedDocument,
                      perspective: selectedPerspective.perspective,
                    }}
                    minHeight="400px"
                    maxHeight="60vh"
                  />
                </Stack>
              </Suspense>
            </Box>
          </Dialog>
        )}
      </Stack>
    </Box>
  )
}
