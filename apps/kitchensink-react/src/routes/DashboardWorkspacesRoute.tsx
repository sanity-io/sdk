import {useStudioWorkspacesByProjectIdDataset} from '@sanity/sdk-react'
import {Card, Flex, Stack, Text} from '@sanity/ui'
import {Code} from '@sanity/ui/code'
import {type ReactElement, Suspense} from 'react'

import {PageLayout} from '../components/PageLayout'

function DashboardWorkspacesContent() {
  const {workspacesByProjectIdAndDataset, error} = useStudioWorkspacesByProjectIdDataset()

  return (
    <PageLayout
      title="Studio Workspaces By Resource ID"
      subtitle="Workspaces grouped by project and dataset"
    >
      <Card padding={4} radius={2} shadow={1}>
        <Stack gap={4}>
          {error && (
            <Flex direction="column" gap={2}>
              <Text size={1} weight="semibold">
                Error:
              </Text>
              <Text size={1}>{error}</Text>
            </Flex>
          )}

          <Flex direction="column" gap={2}>
            <Text size={1} weight="semibold">
              Workspaces by Resource ID:
            </Text>
            <Code language="json">{JSON.stringify(workspacesByProjectIdAndDataset, null, 2)}</Code>
          </Flex>
        </Stack>
      </Card>
    </PageLayout>
  )
}

export function DashboardWorkspacesRoute(): ReactElement {
  return (
    <Suspense
      fallback={
        <PageLayout title="Studio Workspaces By Resource ID" subtitle="Loading workspaces">
          <Card padding={4} radius={2} shadow={1}>
            <Text size={1}>Loading workspaces…</Text>
          </Card>
        </PageLayout>
      }
    >
      <DashboardWorkspacesContent />
    </Suspense>
  )
}
