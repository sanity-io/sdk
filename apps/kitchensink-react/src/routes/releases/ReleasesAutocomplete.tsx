import {SearchIcon} from '@sanity/icons'
import {type PerspectiveHandle, type ReleaseDocument} from '@sanity/sdk-react'
import {Autocomplete, Card, Stack, Text} from '@sanity/ui'

import {isReleasePerspective} from './util'

interface ReleasesAutocompleteProps {
  activeReleases: ReleaseDocument[]
  selectedPerspective: PerspectiveHandle
  onSelectRelease: (releaseName: string) => void
}

export function ReleasesAutocomplete({
  activeReleases,
  selectedPerspective,
  onSelectRelease,
}: ReleasesAutocompleteProps): React.ReactNode {
  if (!activeReleases || activeReleases.length === 0) return null

  return (
    <Card paddingBottom={4}>
      <Autocomplete
        id="release-autocomplete"
        filterOption={(query, option) =>
          option.payload.metadata.title.toLowerCase().indexOf(query.toLowerCase()) > -1
        }
        fontSize={[2, 2, 3]}
        icon={<SearchIcon style={{width: '1.5em', height: '1.5em'}} />}
        openButton
        options={activeReleases.map((release) => ({
          value: release.name,
          payload: release,
        }))}
        padding={[3, 3, 4]}
        placeholder="Type to find release …"
        renderOption={(option) => {
          const release = option.payload
          const publishDate = release.publishAt || release.metadata?.intendedPublishAt
          const formattedDate = publishDate ? new Date(publishDate).toLocaleString() : null
          return (
            <Card as="button" padding={2}>
              <Stack space={2}>
                <Text size={[2, 2, 3]} weight="semibold">
                  {release.metadata.title}
                </Text>
                <Text size={1} muted>
                  Release ID: {release.name}
                </Text>
                <Text size={1}>
                  Type: {release.metadata.releaseType} | State: {release.state}
                </Text>
                {formattedDate && (
                  <Text size={1} muted>
                    Publish: {formattedDate}
                  </Text>
                )}
              </Stack>
            </Card>
          )
        }}
        renderValue={(value, option) => option?.payload.metadata.title || value}
        value={
          isReleasePerspective(selectedPerspective.perspective)
            ? selectedPerspective.perspective.releaseName
            : ''
        }
        onSelect={(value: string) => onSelectRelease(value)}
      />
    </Card>
  )
}
