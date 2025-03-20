import {useStudioWorkspacesByResourceId} from '@sanity/sdk-react'
import {Card, Code, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {type ReactElement} from 'react'

export function DashboardWorkspacesRoute(): ReactElement {
  const {workspacesByResourceId, error, isConnected} = useStudioWorkspacesByResourceId()

  return (
    <Container width={2}>
      <Stack space={4} paddingY={4}>
        <Heading>Studio Workspaces By Resource ID</Heading>

        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Flex direction="column" gap={2}>
              <Text weight="semibold">Connection Status:</Text>
              <Text>{isConnected ? 'Connected' : 'Not Connected'}</Text>
            </Flex>

            {error && (
              <Flex direction="column" gap={2}>
                <Text weight="semibold">Error:</Text>
                <Text>{error}</Text>
              </Flex>
            )}

            <Flex direction="column" gap={2}>
              <Text weight="semibold">Workspaces by Resource ID:</Text>
              <Code language="json">{JSON.stringify(workspacesByResourceId, null, 2)}</Code>
            </Flex>
          </Stack>
        </Card>
      </Stack>
    </Container>
  )
}
