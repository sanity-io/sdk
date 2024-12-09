import {Badge, Button, Stack, Text} from '@sanity/ui'
import styled from 'styled-components'

/**
 * @public
 */
export interface DocumentPreviewLayoutProps {
  docType?: string
  media?: React.ReactNode // Todo: determine how media data will be passed to this component; need to represent either an image or an icon
  selected?: boolean
  status?: string
  subtitle?: string
  title: string
  url?: string
}

// Todo: replace with actual media (either image or icon)
const TempMedia = styled.div`
  aspect-ratio: 1 / 1;
  inline-size: 33px;
  border: 1px solid #ccc;
`

// Set a containment context for the Preview
const Container = styled.div`
  container-type: inline-size;
  display: flex;
  align-items: center;
  gap: 0.75em;
`

// Status labels are visually hidden when a narrow document list is rendered;
// text remains accessible to screen readers
const StatusLabel = styled.span`
  @container (width < 52ch) {
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    height: 1px;
    overflow: hidden;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }
`

/**
 * This is a component that renders a document preview.
 *
 * @public
 *
 * @param props - The props for the DocumentPreviewLayout component.
 * @returns - The DocumentPreviewLayout component.
 */
export const DocumentPreviewLayout = ({
  docType,
  selected = false,
  status = '',
  subtitle = '',
  title,
  url = '',
}: DocumentPreviewLayoutProps): JSX.Element => {
  // Todo: empty state
  if (!title) {
    return <></>
  }

  return (
    <Button
      as="a"
      href={url}
      mode="bleed"
      width="fill"
      padding={3}
      selected={selected}
      data-ui="DocumentPreviewLayout"
    >
      <Container>
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

        {docType && (
          <Badge padding={2} fontSize={0}>
            {docType}
          </Badge>
        )}

        {/* Todo: finalize UI for this */}
        {status === 'published' && (
          <Badge padding={2} fontSize={0} tone="positive">
            ✔︎ <StatusLabel>published</StatusLabel>
          </Badge>
        )}

        {/* Todo: finalize UI for this, determine if we need to show 'draft' or just 'published' */}
        {status === 'draft' && (
          <Badge padding={2} fontSize={0} tone="caution">
            ⛑︎ <StatusLabel>draft</StatusLabel>
          </Badge>
        )}
      </Container>
    </Button>
  )
}

DocumentPreviewLayout.displayName = 'DocumentPreviewLayout'
