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
import {Badge} from '@sanity/ui'
import {type ComponentType, type JSX, type ReactNode, type SVGProps} from 'react'
import {useParams} from 'react-router'
import {Box, Card, Flex, Grid, Heading, Icon, Text, VStack} from 'ui5'

import {FallbackAvatar} from '../components/FallbackAvatar'
import {PageLayout} from '../components/PageLayout'

function IconText({
  icon,
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
    <Flex alignItems="center" gap={2}>
      <Icon aria-hidden icon={icon} />
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
        <Text size={1}>
          The user with ID &quot;{userId}&quot; was not found in this {resourceType}.
        </Text>
      </PageLayout>
    )
  }

  return (
    <PageLayout icon={UserIcon} title="User Profile" subtitle={user.sanityUserId}>
      <VStack gap={4}>
        <Card density="regular">
          <VStack gap={4}>
            <Flex alignItems="center" gap={4}>
              <FallbackAvatar
                size={3}
                src={user.profile.imageUrl}
                displayName={user.profile.displayName}
              />
              <VStack gap={2}>
                <Heading as="h2" size={1}>
                  {user.profile.displayName}
                </Heading>
                <IconText icon={EnvelopeIcon} muted>
                  {user.profile.email}
                </IconText>
                <Flex alignItems="center" gap={2}>
                  <Icon aria-hidden icon={HashIcon} />
                  <Badge tone="primary" fontSize={1}>
                    {user.profile.id}
                  </Badge>
                </Flex>
              </VStack>
            </Flex>

            <Grid gap={3} gridTemplateColumns="repeat(2, minmax(0, 1fr))">
              <VStack gap={2}>
                <IconText icon={CalendarIcon} weight="semibold">
                  Created
                </IconText>
                <Text size={1} muted>
                  {new Date(user.profile.createdAt).toLocaleDateString()}
                </Text>
              </VStack>

              {user.profile.updatedAt && (
                <VStack gap={2}>
                  <IconText icon={SyncIcon} weight="semibold">
                    Last Updated
                  </IconText>
                  <Text size={1} muted>
                    {new Date(user.profile.updatedAt).toLocaleDateString()}
                  </Text>
                </VStack>
              )}
            </Grid>
          </VStack>
        </Card>

        {user.memberships.length > 0 && (
          <Card density="regular">
            <VStack gap={4}>
              <Flex alignItems="center" gap={2}>
                <Icon aria-hidden icon={LockIcon} />
                <Heading as="h3" size={1}>
                  Access & Permissions
                </Heading>
              </Flex>

              <VStack gap={3}>
                {user.memberships.map((membership, index) => (
                  <Box border key={`${membership.resourceId}-${index}`} padding={3}>
                    <Grid gap={3} gridTemplateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']}>
                      <VStack gap={2}>
                        <Flex alignItems="center" gap={2}>
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
                      </VStack>

                      <VStack gap={2}>
                        <IconText icon={TiersIcon} weight="semibold">
                          Roles
                        </IconText>
                        <Flex flexWrap="wrap" gap={1}>
                          {membership.roleNames.map((role) => (
                            <Badge key={role} tone="primary" fontSize={1}>
                              {role}
                            </Badge>
                          ))}
                        </Flex>
                      </VStack>

                      {membership.addedAt && (
                        <VStack gap={2}>
                          <IconText icon={AddCircleIcon} weight="semibold">
                            Added
                          </IconText>
                          <Text size={1} muted>
                            {new Date(membership.addedAt).toLocaleDateString()}
                          </Text>
                        </VStack>
                      )}

                      {membership.lastSeenAt && (
                        <VStack gap={2}>
                          <IconText icon={EyeOpenIcon} weight="semibold">
                            Last Seen
                          </IconText>
                          <Text size={1} muted>
                            {new Date(membership.lastSeenAt).toLocaleDateString()}
                          </Text>
                        </VStack>
                      )}
                    </Grid>
                  </Box>
                ))}
              </VStack>
            </VStack>
          </Card>
        )}
      </VStack>
    </PageLayout>
  )
}
