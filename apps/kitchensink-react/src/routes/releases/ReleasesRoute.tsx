import {
  type DocumentHandle,
  PerspectiveHandle,
  useActiveReleases,
  useDocument,
  useDocumentPreview,
  useDocumentProjection,
  useDocuments,
  usePerspective,
} from '@sanity/sdk-react'
import {Box, Button, Card, Flex, Heading, Stack, Text, TextInput} from '@sanity/ui'
import {type JSX, useMemo, useState} from 'react'

import {DocumentListLayout} from '../../components/DocumentListLayout/DocumentListLayout'
import {DocumentPreview} from '../../DocumentCollection/DocumentPreview'
import {ReleasesAutocomplete} from './ReleasesAutocomplete'
import {isReleasePerspective} from './util'

const DEFAULT_PERSPECTIVES = [
  {name: 'raw', title: 'Raw', description: 'View all document versions'},
  {name: 'published', title: 'Published', description: 'View published content'},
  {name: 'drafts', title: 'Drafts', description: 'View draft content'},
] as const

function DocumentList({
  perspective,
  onSelectDocument,
}: {
  perspective: PerspectiveHandle
  onSelectDocument: (doc: DocumentHandle) => void
  selectedDocumentId?: string
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

export function ReleasesRoute(): JSX.Element {
  const [selectedPerspective, setSelectedPerspective] = useState<PerspectiveHandle>({
    perspective: 'drafts',
  })
  const activeReleases = useActiveReleases()
  const [selectedDocument, setSelectedDocument] = useState<DocumentHandle>({
    documentId: '386584b0-237f-4870-849e-f71af8e6b269',
    documentType: 'author',
  })

  const calculatedPerspective = usePerspective(selectedPerspective)

  const handlePerspectiveSelect = (perspective: PerspectiveHandle) => {
    setSelectedPerspective(perspective)
  }

  const handleDocumentIdSubmit = (documentId: string) => {
    setSelectedDocument({documentId, documentType: 'author'})
  }

  const documentOptions = useMemo(
    () => ({...selectedDocument, perspective: selectedPerspective.perspective}),
    [selectedDocument, selectedPerspective],
  )
  const documentProjectionOptions = useMemo(
    () => ({
      ...documentOptions,
      projection: `{name, "bestFriend": bestFriend->name}` as `{${string}}`,
    }),
    [documentOptions],
  )
  const documentResult = useDocument(documentOptions)
  const previewResult = useDocumentPreview(documentOptions)
  const projectionResult = useDocumentProjection(documentProjectionOptions)

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Heading as="h1" size={5}>
          Perspectives
        </Heading>

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
                onClick={() => handlePerspectiveSelect({perspective: perspective.name})}
              />
            ))}
          </Stack>
        </Box>

        <Box>
          <Text size={1} weight="semibold" style={{marginBottom: '8px'}}>
            Releases
          </Text>
          <ReleasesAutocomplete
            activeReleases={activeReleases}
            selectedPerspective={selectedPerspective}
            onSelectRelease={(releaseName) => {
              const release = activeReleases.find((r) => r.name === releaseName)
              if (release) {
                handlePerspectiveSelect({perspective: {releaseName: release.name}})
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
              Documents in Selected{' '}
              {isReleasePerspective(selectedPerspective.perspective) ? 'Release' : 'Perspective'}
            </Heading>
            <DocumentList
              perspective={selectedPerspective}
              onSelectDocument={setSelectedDocument}
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
                onChange={(event) => handleDocumentIdSubmit(event.currentTarget.value)}
                placeholder="Enter document ID"
              />
              <Button
                text="View Document"
                onClick={() => handleDocumentIdSubmit(selectedDocument?.documentId || '')}
              />
            </Stack>
          </Card>
        </Box>

        {selectedDocument && (
          <Box paddingTop={4}>
            <Stack space={4}>
              <Card padding={4} radius={2} shadow={1} tone="primary">
                <Heading as="h3" size={2} style={{marginBottom: 8}}>
                  Selected Document Data
                </Heading>
                <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
                  {JSON.stringify(documentResult.data, null, 2)}
                </pre>
              </Card>

              <Card padding={4} radius={2} shadow={1} tone="primary">
                <Heading as="h3" size={2} style={{marginBottom: 8}}>
                  Document Preview
                </Heading>
                <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
                  {JSON.stringify(previewResult.data, null, 2)}
                </pre>
              </Card>

              <Card padding={4} radius={2} shadow={1} tone="primary">
                <Heading as="h3" size={2} style={{marginBottom: 8}}>
                  Document Projection
                </Heading>
                <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>
                  {JSON.stringify(projectionResult.data, null, 2)}
                </pre>
              </Card>
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
