import {useDocumentProjection, useResource} from '@sanity/sdk-react'
import {Button} from '@sanity/ui'
import {type JSX, type ReactNode} from 'react'
import {Card, Code, Flex, Text} from 'ui5'

/** The project and dataset in play, so a mismatch with the Studio link is visible. */
function ScopeText(): JSX.Element | null {
  const resource = useResource()
  if (!resource || !('projectId' in resource)) return null

  return (
    <Text size={1} muted>
      {`Project ${resource.projectId} · dataset ${resource.dataset}`}
    </Text>
  )
}

/**
 * Says which document a route is working on, and links to it in the Studio.
 *
 * Shared by the routes whose point is interop with the Studio: the link and the
 * project and dataset beside it are what make "the same thing appears in both"
 * a claim you can check rather than take on trust.
 */
export function DocumentHeaderCard({
  documentId,
  documentType,
  studioUrl,
  testIdPrefix,
  children,
}: {
  documentId: string
  documentType: string
  studioUrl: string
  /** Prefixes the test ids, so a spec can tell one route's card from another's. */
  testIdPrefix: string
  /** Route-specific controls, rendered under the document id. */
  children?: ReactNode
}): JSX.Element {
  const {data} = useDocumentProjection<{name: string | null}>({
    documentId,
    documentType,
    projection: `{name}`,
  })

  return (
    <Card density="regular">
      <Flex alignItems="flex-start" gap={3}>
        <Flex flexDirection="column" flexGrow={1} gap={3}>
          <Text size={1} weight="medium">
            {data?.name ?? 'Untitled'}
          </Text>
          <Code size={0} data-testid={`${testIdPrefix}-document-id`}>
            {documentId}
          </Code>
          {children}
          <ScopeText />
        </Flex>
        <Button
          as="a"
          href={studioUrl}
          target="_blank"
          rel="noreferrer"
          mode="ghost"
          text="Open in Studio"
          data-testid={`${testIdPrefix}-studio-link`}
        />
      </Flex>
    </Card>
  )
}
