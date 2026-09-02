import {useStudioWorkspacesByProjectIdDataset} from '@sanity/sdk-react'
import {type ReactElement, Suspense} from 'react'
import {Card, Code, Flex, Text, VStack} from 'ui5'

import {PageLayout} from '../components/PageLayout'

function DashboardWorkspacesContent() {
  const {workspacesByProjectIdAndDataset, error} = useStudioWorkspacesByProjectIdDataset()

  return (
    <PageLayout
      title="Studio Workspaces By Resource ID"
      subtitle="Workspaces grouped by project and dataset"
    >
      <Card density="regular">
        <VStack gap={4}>
          {error && (
            <Flex flexDirection="column" gap={2}>
              <Text size={1} weight="semibold">
                Error:
              </Text>
              <Text size={1}>{error}</Text>
            </Flex>
          )}

          <Flex flexDirection="column" gap={2}>
            <Text size={1} weight="semibold">
              Workspaces by Resource ID:
            </Text>
            <Code language="json">{JSON.stringify(workspacesByProjectIdAndDataset, null, 2)}</Code>
          </Flex>
        </VStack>
      </Card>
    </PageLayout>
  )
}

export function DashboardWorkspacesRoute(): ReactElement {
  return (
    <Suspense
      fallback={
        <PageLayout title="Studio Workspaces By Resource ID" subtitle="Loading workspaces">
          <Card density="regular">
            <Text size={1}>Loading workspaces…</Text>
          </Card>
        </PageLayout>
      }
    >
      <DashboardWorkspacesContent />
    </Suspense>
  )
}
