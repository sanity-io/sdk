import {Box, Button, Flex, Stack, Text} from '@sanity/ui'
import styled from 'styled-components'

export interface DocumentPreviewProps {
  docType?: string
  media?: React.ReactNode // Todo: determine how media data will be passed to this component; need to represent either an image or an icon
  status?: string // Todo: establish boundaries for what this prop can be, or where the data will be coming from
  subtitle?: string
  title: string
  url?: string
  selected?: boolean
}

export default function DocumentPreview({
  selected = false,
  subtitle = '',
  title,
  url = '',
}: DocumentPreviewProps): JSX.Element {
  const TempMedia = styled(Box)`
    aspect-ratio: 1 / 1;
    inline-size: 33px;
    border: 1px solid #ccc;
  `

  // Todo: empty state
  if (!title) {
    return <></>
  }

  return (
    <Button as="a" href={url} mode="bleed" width="fill" selected={selected}>
      <Flex align="center" gap={3} padding={2} data-ui="DocumentPreview">
        <TempMedia />

        <Stack flex={1} space={2}>
          <Text size={1} weight="medium" textOverflow="ellipsis">
            {title}
          </Text>
          {subtitle && (
            <Text muted size={1} textOverflow="ellipsis">
              {subtitle}
            </Text>
          )}
        </Stack>
      </Flex>
    </Button>
  )
}

DocumentPreview.displayName = 'DocumentPreview'
