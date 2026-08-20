import {DocumentIcon} from '@sanity/icons/Document'
import {Badge, Box, Card, Flex, Text} from '@sanity/ui'
import {forwardRef, type JSX} from 'react'

/**
 * @public
 */
export interface DocumentPreviewLayoutProps {
  docType?: string
  media?: {type: string; url: string} | null | undefined
  onClick?: () => void
  selected?: boolean
  status?: string
  subtitle?: string
  title: string
  documentId?: string
}

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
      media,
      onClick,
      selected = false,
      status = '',
      subtitle = '',
      title,
      documentId,
    }: DocumentPreviewLayoutProps,
    ref: React.Ref<HTMLElement>,
  ): JSX.Element => {
    if (!title) {
      return <></>
    }

    let previewMedia
    if (media?.url) {
      const baseUrl = new URL(media.url)
      baseUrl.searchParams.set('h', '66')
      baseUrl.searchParams.set('w', '66')
      baseUrl.searchParams.set('fit', 'crop')
      previewMedia = <img src={baseUrl.toString()} alt="" width={33} height={33} />
    } else {
      previewMedia = <DocumentIcon />
    }

    return (
      <Card
        as="button"
        type="button"
        onClick={onClick}
        padding={2}
        radius={2}
        ref={ref as React.Ref<HTMLButtonElement>}
        selected={selected}
        tone={selected ? 'primary' : 'inherit'}
        data-testid={`document-preview-${documentId || 'unknown'}`}
        style={{width: '100%', textAlign: 'start', cursor: 'pointer'}}
      >
        <Flex align="center" gap={3}>
          <Flex
            align="center"
            justify="center"
            style={{width: 33, height: 33, flexShrink: 0, overflow: 'hidden'}}
          >
            {previewMedia}
          </Flex>

          <Box flex={1} style={{minWidth: 0}}>
            <Text data-testid="document-title" size={1} textOverflow="ellipsis" weight="medium">
              {title}
            </Text>
            {subtitle && (
              <Box marginTop={1}>
                <Text data-testid="document-subtitle" muted size={1} textOverflow="ellipsis">
                  {subtitle}
                </Text>
              </Box>
            )}
          </Box>

          {docType && <Badge fontSize={1}>{docType}</Badge>}
          {status === 'published' && (
            <Badge fontSize={1} tone="positive">
              published
            </Badge>
          )}
          {status === 'draft' && (
            <Badge fontSize={1} tone="caution">
              draft
            </Badge>
          )}
        </Flex>
      </Card>
    )
  },
)

DocumentPreviewLayout.displayName = 'DocumentPreviewLayout'
