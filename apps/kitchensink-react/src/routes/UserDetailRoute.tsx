import {useProject, useUser} from '@sanity/sdk-react'
import {Badge, Card, Flex, Grid, Heading, Stack, Text} from '@sanity/ui'
import {type JSX} from 'react'
import {useParams} from 'react-router'

import {FallbackAvatar} from '../components/FallbackAvatar'
import {PageLayout} from '../components/PageLayout'

export function UserDetailRoute(): JSX.Element {
  const {userId} = useParams<{userId: string}>()
  const {organizationId, id: projectId} = useProject()

  const resourceType = organizationId ? 'organization' : 'project'
  const resourceId = organizationId || projectId

  const {data: user} = useUser({
    userId: userId || '',
    resourceType,
    [resourceType === 'organization' ? 'organizationId' : 'projectId']: resourceId,
  })

  if (!user) {
    return (
      <PageLayout title="❓ User Not Found" subtitle="The requested user could not be located">
        <Text>
          The user with ID &quot;{userId}&quot; was not found in this {resourceType}.
        </Text>
      </PageLayout>
    )
  }

  return (
    <PageLayout title="👤 User Profile" subtitle={user.sanityUserId}>
      <Stack space={4}>
        {/* Main Profile Card */}
        <Card padding={4} radius={3} shadow={1}>
          <Stack space={4}>
            {/* User Avatar & Basic Info */}
            <Flex align="center" gap={4}>
              <FallbackAvatar
                size={3}
                src={user.profile.imageUrl}
                displayName={user.profile.displayName}
              />
              <Stack space={2}>
                <Heading as="h2" size={2}>
                  {user.profile.displayName}
                </Heading>
                <Text muted size={1}>
                  📧 {user.profile.email}
                </Text>
                <Badge tone="primary" fontSize={1}>
                  🆔 {user.profile.id}
                </Badge>
              </Stack>
            </Flex>

            {/* Profile Details Grid */}
            <Grid columns={2} gap={3}>
              <Stack space={2}>
                <Text weight="semibold" size={1}>
                  📅 Created
                </Text>
                <Text size={1} muted>
                  {new Date(user.profile.createdAt).toLocaleDateString()}
                </Text>
              </Stack>

              {user.profile.updatedAt && (
                <Stack space={2}>
                  <Text weight="semibold" size={1}>
                    🔄 Last Updated
                  </Text>
                  <Text size={1} muted>
                    {new Date(user.profile.updatedAt).toLocaleDateString()}
                  </Text>
                </Stack>
              )}
            </Grid>
          </Stack>
        </Card>

        {/* Memberships Section */}
        {user.memberships.length > 0 && (
          <Card padding={4} radius={3} shadow={1}>
            <Stack space={4}>
              <Heading as="h3" size={2}>
                🔐 Access & Permissions
              </Heading>

              <Stack space={3}>
                {user.memberships.map((membership, index) => (
                  <Card
                    key={`${membership.resourceId}-${index}`}
                    padding={3}
                    tone="transparent"
                    border
                    radius={2}
                  >
                    <Grid columns={[1, 2]} gap={3}>
                      <Stack space={2}>
                        <Flex align="center" gap={2}>
                          <Text weight="semibold" size={1}>
                            {membership.resourceType === 'project' ? '📦' : '🏢'} Resource
                          </Text>
                          <Badge tone="default" fontSize={1}>
                            {membership.resourceType}
                          </Badge>
                        </Flex>
                        <Text size={1} muted>
                          {membership.resourceId}
                        </Text>
                      </Stack>

                      <Stack space={2}>
                        <Text weight="semibold" size={1}>
                          🎭 Roles
                        </Text>
                        <Flex gap={1} wrap="wrap">
                          {membership.roleNames.map((role) => (
                            <Badge key={role} tone="primary" fontSize={1}>
                              {role}
                            </Badge>
                          ))}
                        </Flex>
                      </Stack>

                      {membership.addedAt && (
                        <Stack space={2}>
                          <Text weight="semibold" size={1}>
                            ➕ Added
                          </Text>
                          <Text size={1} muted>
                            {new Date(membership.addedAt).toLocaleDateString()}
                          </Text>
                        </Stack>
                      )}

                      {membership.lastSeenAt && (
                        <Stack space={2}>
                          <Text weight="semibold" size={1}>
                            👁️ Last Seen
                          </Text>
                          <Text size={1} muted>
                            {new Date(membership.lastSeenAt).toLocaleDateString()}
                          </Text>
                        </Stack>
                      )}
                    </Grid>
                  </Card>
                ))}
              </Stack>
            </Stack>
          </Card>
        )}
      </Stack>
    </PageLayout>
  )
}
