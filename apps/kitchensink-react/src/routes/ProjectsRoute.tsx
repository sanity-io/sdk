import {useProjects} from '@sanity/sdk-react'
import {TextInput} from '@sanity/ui'
import {ChangeEvent, type JSX, Suspense, useState} from 'react'
import {Box, Card, Checkbox, Flex, Text, VStack} from 'ui5'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {PageLayout} from '../components/PageLayout'

export function ProjectsRoute(): JSX.Element {
  const [organizationId, setOrganizationId] = useState<string | undefined>(undefined)
  const [includeMembers, setIncludeMembers] = useState<boolean>(false)
  return (
    <PageLayout title="Organization Projects" subtitle="projects available for your user">
      <VStack gap={3}>
        <VStack gap={2}>
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
        </VStack>
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
      </VStack>
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
  const {data: projects} = useProjects({organizationId, includeMembers})

  return (
    <DocumentListLayout>
      {projects.map((project) => (
        <li key={project.id}>
          <Card density="compact">
            <Flex alignItems="center" gap={2}>
              <Box paddingY={2}>
                <Flex flexDirection="column" gap={1}>
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
