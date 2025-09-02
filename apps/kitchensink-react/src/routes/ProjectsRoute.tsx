import {useProjects} from '@sanity/sdk-react'
import {Box, Card, Checkbox, Flex, Label, Text} from '@sanity/ui'
import {ChangeEvent, type JSX, Suspense, useState} from 'react'

import {PageLayout} from '../components/PageLayout'

export function ProjectsRoute(): JSX.Element {
  const [organizationId, setOrganizationId] = useState<string | undefined>(undefined)
  const [includeMembers, setIncludeMembers] = useState<boolean>(false)
  return (
    <PageLayout title="Organization Projects" subtitle={`projects available for your user`}>
      <Label htmlFor="organizationId" size={1}>
        Organization ID
      </Label>
      <input
        value={organizationId}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setOrganizationId(e.currentTarget.value)}
        style={{width: '100%', border: '1px solid #ccc', padding: '8px', borderRadius: '4px'}}
      />
      <Label htmlFor="includeMembers" size={1}>
        Include members
      </Label>
      <Checkbox
        checked={includeMembers}
        label="Include members"
        id="includeMembers"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setIncludeMembers(e.currentTarget.checked)
        }}
      />

      <Suspense fallback={<Text>Loading projects...</Text>}>
        <ProjectsList organizationId={organizationId} includeMembers={includeMembers} />
      </Suspense>
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
    <ol className="DocumentListLayout list-none" style={{gap: 2}}>
      {projects.map((project) => (
        <li key={project.id}>
          <Card width="fill" marginBottom={2} style={{cursor: 'pointer'}} tone="inherit">
            <Flex align="center" gap={2} padding={2}>
              <Box paddingY={2}>
                <Flex direction="column" gap={1}>
                  <Text>{project.displayName}</Text>
                  <Text muted>Project ID: {project.id}</Text>
                  <Text muted>Organization ID: {project.organizationId}</Text>
                  {includeMembers && 'members' in project && (
                    <Text muted>Members: {project.members?.length}</Text>
                  )}
                </Flex>
              </Box>
            </Flex>
          </Card>
        </li>
      ))}
    </ol>
  )
}
