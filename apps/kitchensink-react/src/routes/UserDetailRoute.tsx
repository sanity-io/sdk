import {AddCircleIcon} from '@sanity/icons/AddCircle'
import {CalendarIcon} from '@sanity/icons/Calendar'
import {EarthGlobeIcon} from '@sanity/icons/EarthGlobe'
import {EnvelopeIcon} from '@sanity/icons/Envelope'
import {ErrorOutlineIcon} from '@sanity/icons/ErrorOutline'
import {EyeOpenIcon} from '@sanity/icons/EyeOpen'
import {HashIcon} from '@sanity/icons/Hash'
import {LockIcon} from '@sanity/icons/Lock'
import {ProjectsIcon} from '@sanity/icons/Projects'
import {SyncIcon} from '@sanity/icons/Sync'
import {TiersIcon} from '@sanity/icons/Tiers'
import {UserIcon} from '@sanity/icons/User'
import {useProject, useUser} from '@sanity/sdk-react'
import {Badge, Card, Flex, Grid, Heading, Stack, Text} from '@sanity/ui'
import {type ComponentType, type JSX, type ReactNode, type SVGProps} from 'react'
import {useParams} from 'react-router'

import {FallbackAvatar} from '../components/FallbackAvatar'
import {PageLayout} from '../components/PageLayout'

function IconText({
  icon: Icon,
  children,
  muted,
  weight,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  children: ReactNode
  muted?: boolean
  weight?: 'semibold'
}): JSX.Element {
  return (
    <Flex align="center" gap={2}>
      <Text muted={muted} size={1} weight={weight}>
        <Icon />
      </Text>
      <Text muted={muted} size={1} weight={weight}>
        {children}
      </Text>
    </Flex>
  )
}

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
      <PageLayout
        icon={ErrorOutlineIcon}
        title="User Not Found"
        subtitle="The requested user could not be located"
      >
        <Text>
          The user with ID &quot;{userId}&quot; was not found in this {resourceType}.
        </Text>
      </PageLayout>
    )
  }

  return (
    <PageLayout icon={UserIcon} title="User Profile" subtitle={user.sanityUserId}>
      <Stack gap={4}>
        <Card padding={4} radius={3} shadow={1}>
          <Stack gap={4}>
            <Flex align="center" gap={4}>
              <FallbackAvatar
                size={3}
                src={user.profile.imageUrl}
                displayName={user.profile.displayName}
              />
              <Stack gap={2}>
                <Heading as="h2" size={2}>
                  {user.profile.displayName}
                </Heading>
                <IconText icon={EnvelopeIcon} muted>
                  {user.profile.email}
                </IconText>
                <Flex align="center" gap={2}>
                  <Text size={1}>
                    <HashIcon />
                  </Text>
                  <Badge tone="primary" fontSize={1}>
                    {user.profile.id}
                  </Badge>
                </Flex>
              </Stack>
            </Flex>

            <Grid gridTemplateColumns={2} gap={3}>
              <Stack gap={2}>
                <IconText icon={CalendarIcon} weight="semibold">
                  Created
                </IconText>
                <Text size={1} muted>
                  {new Date(user.profile.createdAt).toLocaleDateString()}
                </Text>
              </Stack>

              {user.profile.updatedAt && (
                <Stack gap={2}>
                  <IconText icon={SyncIcon} weight="semibold">
                    Last Updated
                  </IconText>
                  <Text size={1} muted>
                    {new Date(user.profile.updatedAt).toLocaleDateString()}
                  </Text>
                </Stack>
              )}
            </Grid>
          </Stack>
        </Card>

        {user.memberships.length > 0 && (
          <Card padding={4} radius={3} shadow={1}>
            <Stack gap={4}>
              <Flex align="center" gap={2}>
                <Text size={2}>
                  <LockIcon />
                </Text>
                <Heading as="h3" size={2}>
                  Access & Permissions
                </Heading>
              </Flex>

              <Stack gap={3}>
                {user.memberships.map((membership, index) => (
                  <Card
                    key={`${membership.resourceId}-${index}`}
                    padding={3}
                    tone="transparent"
                    border
                    radius={2}
                  >
                    <Grid gridTemplateColumns={[1, 2]} gap={3}>
                      <Stack gap={2}>
                        <Flex align="center" gap={2}>
                          <IconText
                            icon={
                              membership.resourceType === 'project' ? ProjectsIcon : EarthGlobeIcon
                            }
                            weight="semibold"
                          >
                            Resource
                          </IconText>
                          <Badge tone="default" fontSize={1}>
                            {membership.resourceType}
                          </Badge>
                        </Flex>
                        <Text size={1} muted>
                          {membership.resourceId}
                        </Text>
                      </Stack>

                      <Stack gap={2}>
                        <IconText icon={TiersIcon} weight="semibold">
                          Roles
                        </IconText>
                        <Flex gap={1} wrap="wrap">
                          {membership.roleNames.map((role) => (
                            <Badge key={role} tone="primary" fontSize={1}>
                              {role}
                            </Badge>
                          ))}
                        </Flex>
                      </Stack>

                      {membership.addedAt && (
                        <Stack gap={2}>
                          <IconText icon={AddCircleIcon} weight="semibold">
                            Added
                          </IconText>
                          <Text size={1} muted>
                            {new Date(membership.addedAt).toLocaleDateString()}
                          </Text>
                        </Stack>
                      )}

                      {membership.lastSeenAt && (
                        <Stack gap={2}>
                          <IconText icon={EyeOpenIcon} weight="semibold">
                            Last Seen
                          </IconText>
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
