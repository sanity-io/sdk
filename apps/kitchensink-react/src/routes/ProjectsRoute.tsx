import {useProjects} from '@sanity/sdk-react'
import {Box, Card, Checkbox, Flex, Stack, Text, TextInput} from '@sanity/ui'
import {ChangeEvent, type JSX, Suspense, useState} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {PageLayout} from '../components/PageLayout'

export function ProjectsRoute(): JSX.Element {
  const [organizationId, setOrganizationId] = useState<string | undefined>(undefined)
  const [includeMembers, setIncludeMembers] = useState<boolean>(false)
  return (
    <PageLayout title="Organization Projects" subtitle="projects available for your user">
      <Stack gap={3}>
        <Stack gap={2}>
          <Text as="label" htmlFor="organizationId" muted size={1}>
            Organization ID
          </Text>
          <TextInput
            id="organizationId"
            fontSize={1}
            value={organizationId ?? ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setOrganizationId(e.currentTarget.value)
            }
          />
        </Stack>
        <Checkbox
          checked={includeMembers}
          label="Include members"
          id="includeMembers"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setIncludeMembers(e.currentTarget.checked)
          }}
        />

        <Suspense fallback={<Text size={1}>Loading projects...</Text>}>
          <ProjectsList organizationId={organizationId} includeMembers={includeMembers} />
        </Suspense>
      </Stack>
    </PageLayout>
  )
}

function ProjectsList({
  organizationId,
  includeMembers,
}: {
  organizationId: string | undefined
  includeMembers: boolean
}) {
  const projects = useProjects({organizationId, includeMembers})

  return (
    <DocumentListLayout>
      {projects.map((project) => (
        <li key={project.id}>
          <Card padding={2} radius={2} tone="inherit">
            <Flex align="center" gap={2}>
              <Box paddingY={2}>
                <Flex direction="column" gap={1}>
                  <Text size={1}>{project.displayName}</Text>
                  <Text muted size={1}>
                    Project ID: {project.id}
                  </Text>
                  <Text muted size={1}>
                    Organization ID: {project.organizationId}
                  </Text>
                  {includeMembers && 'members' in project && (
                    <Text muted size={1}>
                      Members: {project.members?.length}
                    </Text>
                  )}
                </Flex>
              </Box>
            </Flex>
          </Card>
        </li>
      ))}
    </DocumentListLayout>
  )
}
