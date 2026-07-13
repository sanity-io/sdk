import {useUsers} from '@sanity/sdk-react'
import {Avatar, Box, Card, Flex, Text} from '@sanity/ui'
import {ComponentProps, JSX} from 'react'
import {Link} from 'react-router'

import {FallbackAvatar} from './FallbackAvatar'

type SanityUser = ReturnType<typeof useUsers>['data'][number]

export interface UserListItemProps {
  user: SanityUser
  // When provided, the whole row becomes a link to this route.
  href?: string
  avatarSize?: ComponentProps<typeof Avatar>['size']
}

// Shared user row: fallback avatar + display name + email, optionally wrapped
// in a link. Used by the Users route and the org explorer's users dialog.
export function UserListItem({user, href, avatarSize = 2}: UserListItemProps): JSX.Element {
  const card = (
    <Card
      width="fill"
      marginBottom={2}
      tone="inherit"
      style={href ? {cursor: 'pointer'} : undefined}
    >
      <Flex align="center" gap={2} padding={2}>
        <FallbackAvatar
          size={avatarSize}
          src={user.profile.imageUrl}
          displayName={user.profile.displayName}
        />
        <Box paddingY={2}>
          <Flex direction="column" gap={1}>
            <Text>{user.profile.displayName}</Text>
            <Text muted>{user.profile.email}</Text>
          </Flex>
        </Box>
      </Flex>
    </Card>
  )

  if (href) {
    return (
      <Link to={href} style={{textDecoration: 'none'}}>
        {card}
      </Link>
    )
  }

  return card
}
