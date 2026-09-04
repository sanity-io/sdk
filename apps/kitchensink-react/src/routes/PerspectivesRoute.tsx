import {ResourceProvider, useQuery} from '@sanity/sdk-react'
import {type JSX, Suspense} from 'react'
import {Box, Card, Code, Flex, Heading, Text, VStack} from 'ui5'

import {PageLayout} from '../components/PageLayout'

function QueryPanel({
  title,
  docId,
  testId,
}: {
  title: string
  docId: string
  testId: string
}): JSX.Element {
  const {data} = useQuery<Record<string, unknown> | null>({
    query: '*[_id == $id][0]',
    params: {id: docId},
  })

  return (
    <Card data-testid={`panel-${testId}`} density="regular">
      <VStack gap={3}>
        <Heading size={1} as="h2">
          {title}
        </Heading>
        <Box>
          <Text size={1} weight="semibold">
            Document
          </Text>
          <Box padding={3}>
            <Code data-testid={`panel-${testId}-json`}>
              {JSON.stringify(data ?? null, null, 2)}
            </Code>
          </Box>
        </Box>
      </VStack>
    </Card>
  )
}

export function PerspectivesRoute(): JSX.Element {
  const {data: latest} = useQuery<{_id: string} | null>({
    query: '*[_type == "author"] | order(_updatedAt desc)[0]{_id}',
    perspective: 'published',
  })

  const docId = latest?._id

  return (
    <PageLayout
      title="Perspectives Demo (Key Collision)"
      subtitle="Same query, two implicit perspectives"
    >
      <VStack gap={4}>
        <Text size={1} muted>
          This nests ResourceProviders with the same project/dataset but different implicit
          perspectives (drafts vs published). Both panels run the same useQuery for the same
          document id without passing a perspective option.
        </Text>
        <Text size={1} muted>
          Latest published author id: <Code as="span">{docId ?? 'Loading…'}</Code>
        </Text>

        <ResourceProvider perspective="drafts" fallback={null}>
          <Flex gap={4} flexWrap="wrap">
            <Box flexGrow={1} style={{minWidth: 320}}>
              <Suspense>
                {docId ? (
                  <QueryPanel title="Drafts Resource Provider" docId={docId} testId="drafts" />
                ) : null}
              </Suspense>
            </Box>

            <ResourceProvider perspective="published" fallback={null}>
              <Box flexGrow={1} style={{minWidth: 320}}>
                <Suspense>
                  {docId ? (
                    <QueryPanel
                      title="Published Resource Provider"
                      docId={docId}
                      testId="published"
                    />
                  ) : null}
                </Suspense>
              </Box>
            </ResourceProvider>
          </Flex>
        </ResourceProvider>
      </VStack>
    </PageLayout>
  )
}
