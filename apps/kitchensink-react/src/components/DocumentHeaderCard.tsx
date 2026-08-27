import {useDocumentProjection, useResource} from '@sanity/sdk-react'
import {Button, Card, Code, Flex, Stack, Text} from '@sanity/ui'
import {type JSX, type ReactNode} from 'react'

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
    <Card padding={3} radius={2} tone="transparent">
      <Flex align="flex-start" gap={3}>
        <Stack space={3} flex={1}>
          <Text size={1} weight="medium">
            {data?.name ?? 'Untitled'}
          </Text>
          <Code size={0} data-testid={`${testIdPrefix}-document-id`}>
            {documentId}
          </Code>
          {children}
          <ScopeText />
        </Stack>
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
