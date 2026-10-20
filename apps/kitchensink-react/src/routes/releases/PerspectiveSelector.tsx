import {type PerspectiveHandle, type ReleaseDocument} from '@sanity/sdk-react'
import {Box, Card as PaperCard, Flex, Stack, Text} from '@sanity/ui'
import {type JSX, type ReactNode} from 'react'

import {ReleasesAutocomplete} from './ReleasesAutocomplete'
import {isReleasePerspective} from './util'

const DEFAULT_PERSPECTIVES = [
  {name: 'raw', title: 'Raw', description: 'View all document versions'},
  {name: 'published', title: 'Published', description: 'View published content'},
  {name: 'drafts', title: 'Drafts', description: 'View draft content'},
] as const

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
    <PaperCard
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
            <Text size={1} muted>
              {perspective.description}
            </Text>
          </Box>
        </Box>
      </Flex>
    </PaperCard>
  )
}

interface PerspectiveSelectorProps {
  selectedPerspective: PerspectiveHandle
  onPerspectiveSelect: (perspective: PerspectiveHandle) => void
  activeReleases: ReleaseDocument[]
  /** Rendered beside the "Releases" heading, e.g. a button to create one. */
  releasesAction?: ReactNode
}

/**
 * The default perspectives (raw, published, drafts) as selectable cards, plus
 * a filterable autocomplete over the active releases.
 */
export function PerspectiveSelector({
  selectedPerspective,
  onPerspectiveSelect,
  activeReleases,
  releasesAction,
}: PerspectiveSelectorProps): JSX.Element {
  return (
    <>
      <Stack gap={2}>
        <Text size={1} weight="semibold">
          Default Perspectives
        </Text>
        <Stack gap={2}>
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
      </Stack>

      <Stack gap={2}>
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold">
            Releases
          </Text>
          {releasesAction}
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
      </Stack>
    </>
  )
}
