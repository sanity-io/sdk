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
import {Box, Button, Dialog, Flex, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {Code} from '@sanity/ui/code'
import {type JSX, Suspense, useEffect, useMemo, useState} from 'react'
import {Card} from 'ui5'

import {DocumentEditorPanel} from '../../components/DocumentEditorPanel'
import {DocumentListLayout} from '../../components/DocumentListLayout/DocumentListLayout'
import {JsonDocumentEditor} from '../../components/JsonDocumentEditor'
import {PageLayout} from '../../components/PageLayout'
import {DocumentPreview} from '../../DocumentCollection/DocumentPreview'
import {isE2E} from '../../sanityConfigs'
import {PerspectiveSelector} from './PerspectiveSelector'
import {ReleaseActionsDialog} from './ReleaseActionsDialog'
import {isReleasePerspective} from './util'

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
    <Stack gap={3}>
      <Text size={1}>Documents in perspective: {JSON.stringify(perspectiveData)}</Text>
      <DocumentListLayout>
        {data.map((docHandle: DocumentHandle) => (
          <DocumentPreview
            {...docHandle}
            key={docHandle.documentId}
            onClick={() => onSelectDocument(docHandle)}
          />
        ))}
      </DocumentListLayout>
    </Stack>
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
    <Stack gap={4}>
      <Card data-testid="document-data-card" density="regular">
        <Stack gap={3}>
          <Text size={1} weight="semibold">
            Selected Document Data
          </Text>
          <Code language="json">{JSON.stringify(documentResult.data, null, 2)}</Code>
        </Stack>
      </Card>

      <Card data-testid="document-preview-card" density="regular">
        <Stack gap={3}>
          <Text size={1} weight="semibold">
            Document Preview
          </Text>
          <Code language="json">{JSON.stringify(previewResult.data, null, 2)}</Code>
        </Stack>
      </Card>

      <Card data-testid="document-projection-card" density="regular">
        <Stack gap={3}>
          <Text size={1} weight="semibold">
            Document Projection
          </Text>
          <Code language="json">{JSON.stringify(projectionResult.data, null, 2)}</Code>
        </Stack>
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
      <PerspectiveSelector
        selectedPerspective={selectedPerspective}
        onPerspectiveSelect={onPerspectiveSelect}
        activeReleases={activeReleases}
        releasesAction={
          <Button
            text="Create release"
            tone="positive"
            fontSize={1}
            onClick={() => setReleaseDialog({mode: 'create'})}
          />
        }
      />

      {selectedPerspective && (
        <Stack gap={2}>
          <Text size={1} weight="semibold">
            Selected Perspective
          </Text>
          <Card density="regular">
            <Code language="json">{JSON.stringify(calculatedPerspective, null, 2)}</Code>
          </Card>
        </Stack>
      )}

      {selectedPerspective && (
        <Stack gap={2}>
          <Text size={1} weight="semibold">
            Document List in Selected{' '}
            {isReleasePerspective(selectedPerspective.perspective) ? 'Release' : 'Perspective'}
          </Text>
          <DocumentList
            perspective={selectedPerspective}
            onSelectDocument={(doc) => onDocumentIdSubmit(doc.documentId)}
            selectedDocumentId={selectedDocument?.documentId}
          />
        </Stack>
      )}

      <Stack gap={2}>
        <Text size={1} weight="semibold">
          View document across different perspectives
        </Text>
        <Card density="regular">
          <Stack gap={3}>
            <TextInput
              fontSize={1}
              value={selectedDocument?.documentId}
              onChange={(event) => onDocumentIdSubmit(event.currentTarget.value)}
              placeholder="Enter document ID"
            />
            <Button
              fontSize={1}
              text="View Document"
              onClick={() => onDocumentIdSubmit(selectedDocument?.documentId || '')}
            />
          </Stack>
        </Card>
      </Stack>

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
        <Stack gap={2}>
          <Flex align="center" justify="space-between">
            <Text size={1} weight="semibold">
              Selected Release Document
            </Text>
            <Button
              text="Edit release"
              tone="primary"
              fontSize={1}
              onClick={() =>
                setReleaseDialog({mode: 'edit', releaseName: selectedReleaseDocument.name})
              }
            />
          </Flex>
          <Code data-testid="selected-release-document" language="json">
            {JSON.stringify(selectedReleaseDocument, null, 2)}
          </Code>
        </Stack>
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
    <PageLayout title="Releases" subtitle="Switch perspectives and inspect documents">
      <Stack gap={4}>
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
                <Stack gap={4}>
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
    </PageLayout>
  )
}
