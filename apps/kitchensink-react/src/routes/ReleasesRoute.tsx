import {
  type DocumentHandle,
  PerspectiveHandle,
  ReleaseDocument,
  useActiveReleases,
  useDocuments,
  useDocumentsInRelease,
  usePerspective,
} from '@sanity/sdk-react'
import {Box, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {ReleasePerspective} from 'packages/core/src/config/sanityConfig'
import {type JSX, useState} from 'react'

import {DocumentPreview} from '../DocumentCollection/DocumentPreview'

const DEFAULT_PERSPECTIVES = [
  {name: 'raw', title: 'Raw', description: 'View all document versions'},
  {name: 'published', title: 'Published', description: 'View published content'},
  {name: 'drafts', title: 'Drafts', description: 'View draft content'},
] as const

const isReleasePerspective = (
  perspective: PerspectiveHandle['perspective'],
): perspective is ReleasePerspective => {
  return typeof perspective === 'object' && perspective !== null && 'releaseName' in perspective
}

function ReleaseDocumentList({releasePerspective}: {releasePerspective: ReleasePerspective}) {
  const {data} = useDocumentsInRelease({perspective: releasePerspective})

  return (
    <ul>
      {data.map((doc: DocumentHandle) => (
        <DocumentPreview key={doc.documentId} {...doc} />
      ))}
    </ul>
  )
}

function DocumentList({perspective}: {perspective: PerspectiveHandle}) {
  const perspectiveData = usePerspective(perspective)
  const {data: regularData} = useDocuments({
    ...perspective,
    filter: '_type==$type',
    params: {type: 'author'},
    orderings: [{field: '_updatedAt', direction: 'desc'}],
    batchSize: 5,
  })

  return (
    <div>
      <p>Documents in perspective: {JSON.stringify(perspectiveData)}</p>
      {isReleasePerspective(perspective.perspective) ? (
        <ReleaseDocumentList releasePerspective={perspective.perspective} />
      ) : (
        <ul>
          {regularData.map((doc: DocumentHandle) => (
            <DocumentPreview key={doc.documentId} {...doc} />
          ))}
        </ul>
      )}
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

function ReleaseCard({
  release,
  isSelected,
  onClick,
}: {
  release: ReleaseDocument
  isSelected: boolean
  onClick: () => void
}) {
  const publishDate = release.publishAt || release.metadata?.intendedPublishAt
  const formattedDate = publishDate ? new Date(publishDate).toLocaleString() : null

  return (
    <Card
      padding={4}
      radius={2}
      shadow={1}
      tone={release['state'] === 'scheduled' ? 'primary' : 'default'}
      style={{cursor: 'pointer'}}
      onClick={onClick}
      border={isSelected}
    >
      <Stack space={3}>
        <Stack space={1}>
          <Heading size={3}>{release.metadata.title}</Heading>
          <Text size={1} muted>
            Release ID: {release.name}
          </Text>
        </Stack>
        <Flex gap={3}>
          <Text size={1} weight="semibold">
            Release Type:
          </Text>
          <Text size={1}>{release.metadata.releaseType}</Text>
        </Flex>
        <Flex gap={3}>
          <Text size={1} weight="semibold">
            State:
          </Text>
          <Text size={1}>{release['state']}</Text>
        </Flex>
        {formattedDate && (
          <Flex gap={3}>
            <Text size={1} weight="semibold">
              Publish Date:
            </Text>
            <Text size={1}>{formattedDate}</Text>
          </Flex>
        )}
        {release.metadata['description'] && (
          <Text size={1} muted>
            {release.metadata['description']}
          </Text>
        )}
      </Stack>
    </Card>
  )
}

export function ReleasesRoute(): JSX.Element {
  const [selectedPerspective, setSelectedPerspective] = useState<PerspectiveHandle>({
    perspective: 'drafts',
  })
  const activeReleases = useActiveReleases()

  const calculatedPerspective = usePerspective(selectedPerspective)

  const handlePerspectiveSelect = (perspective: PerspectiveHandle) => {
    setSelectedPerspective(perspective)
  }
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
          {activeReleases && activeReleases.length > 0 && (
            <Stack space={4}>
              {activeReleases.map((release) => (
                <ReleaseCard
                  key={release.name}
                  release={release}
                  isSelected={
                    isReleasePerspective(selectedPerspective.perspective) &&
                    selectedPerspective.perspective?.releaseName === release.name
                  }
                  onClick={() =>
                    handlePerspectiveSelect({perspective: {releaseName: release.name}})
                  }
                />
              ))}
            </Stack>
          )}
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
              Documents in Selected Perspective
            </Heading>
            <DocumentList perspective={selectedPerspective} />
          </Box>
        )}
      </Stack>
    </Box>
  )
}
