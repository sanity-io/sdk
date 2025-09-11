import {ResourceProvider, useQuery} from '@sanity/sdk-react'
import {Box, Card, Code, Flex, Heading, Stack, Text} from '@sanity/ui'
import {type JSX, Suspense} from 'react'

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
    <Card padding={4} radius={3} shadow={1} tone="transparent" data-testid={`panel-${testId}`}>
      <Stack space={3}>
        <Heading size={2} as="h2">
          {title}
        </Heading>
        <Box>
          <Text size={1} weight="semibold">
            Document
          </Text>
          <Card padding={3} radius={2} tone="transparent">
            <Code data-testid={`panel-${testId}-json`}>
              {JSON.stringify(data ?? null, null, 2)}
            </Code>
          </Card>
        </Box>
      </Stack>
    </Card>
  )
}

export function PerspectivesRoute(): JSX.Element {
  // Get the latest published author document id once, outside the nested providers,
  // so both subtrees use the same document id.
  const {data: latest} = useQuery<{_id: string} | null>({
    query: '*[_type == "author"] | order(_updatedAt desc)[0]{_id}',
    // may not always return a draft result, but usually does in test dataset
    perspective: 'published',
  })

  const docId = latest?._id

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Heading as="h1" size={5}>
          Perspectives Demo (Key Collision)
        </Heading>
        <Text size={1} muted>
          This nests ResourceProviders with the same project/dataset but different implicit
          perspectives (drafts vs published). Both panels run the same useQuery for the same
          document id without passing a perspective option.
        </Text>
        <Text size={1} muted>
          Latest published author id: <Code>{docId ?? 'Loading…'}</Code>
        </Text>

        {/* ResourceProvider with drafts perspective */}
        <ResourceProvider perspective="drafts" fallback={null}>
          <Flex gap={4} wrap="wrap">
            <Box style={{minWidth: 320, flex: 1}}>
              <Suspense>
                {docId ? (
                  <QueryPanel title="Drafts Resource Provider" docId={docId} testId="drafts" />
                ) : null}
              </Suspense>
            </Box>

            {/* ResourceProvider with published perspective */}
            <ResourceProvider perspective="published" fallback={null}>
              <Box style={{minWidth: 320, flex: 1}}>
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
      </Stack>
    </Box>
  )
}
