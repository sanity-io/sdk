import {Badge, Button, Stack, Text} from '@sanity/ui'
import {forwardRef} from 'react'
import styled from 'styled-components'

/**
 * @public
 */
export interface DocumentPreviewLayoutProps {
  docType?: string
  // Todo: determine how media data will be passed to this component; need to represent either an image or an icon
  media?: React.ReactNode
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
  display: flex;
  > * {
    flex: auto;
  }
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
export const DocumentPreviewLayout = forwardRef(
  (
    {
      docType,
      selected = false,
      status = '',
      subtitle = '',
      title,
      url = '',
      media,
    }: DocumentPreviewLayoutProps,
    ref: React.Ref<HTMLElement>,
  ): JSX.Element => {
    // Todo: empty state
    if (!title) {
      return <></>
    }

    return (
      <Button
        ref={ref as React.Ref<HTMLButtonElement>}
        as="a"
        href={url}
        mode="bleed"
        width="fill"
        padding={3}
        selected={selected}
        data-ui="DocumentPreviewLayout"
      >
        <Container>
          <TempMedia>{media}</TempMedia>

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
  },
)

DocumentPreviewLayout.displayName = 'DocumentPreviewLayout'
