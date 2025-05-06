import {useStudioWorkspacesByProjectIdDataset} from '@sanity/sdk-react'
import {Card, Code, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {type ReactElement, Suspense} from 'react'

function DashboardWorkspacesContent() {
  const {workspacesByProjectIdAndDataset, error} = useStudioWorkspacesByProjectIdDataset()

  return (
    <Container width={2}>
      <Stack space={4} paddingY={4}>
        <Heading>Studio Workspaces By Resource ID</Heading>

        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            {error && (
              <Flex direction="column" gap={2}>
                <Text weight="semibold">Error:</Text>
                <Text>{error}</Text>
              </Flex>
            )}

            <Flex direction="column" gap={2}>
              <Text weight="semibold">Workspaces by Resource ID:</Text>
              <Code language="json">
                {JSON.stringify(workspacesByProjectIdAndDataset, null, 2)}
              </Code>
            </Flex>
          </Stack>
        </Card>
      </Stack>
    </Container>
  )
}

export function DashboardWorkspacesRoute(): ReactElement {
  return (
    <Suspense
      fallback={
        <Container width={2}>
          <Card padding={4} radius={2} shadow={1}>
            <Text>Loading workspaces…</Text>
          </Card>
        </Container>
      }
    >
      <DashboardWorkspacesContent />
    </Suspense>
  )
}
