import {useUsers} from '@sanity/sdk-react/hooks'
import {Avatar, Box, Card, Flex, Heading, Text} from '@sanity/ui'
import {type JSX} from 'react'

import {LoadMore} from '../DocumentCollection/LoadMore'

export function UsersRoute(): JSX.Element {
  const {data, hasMore, isPending, loadMore} = useUsers({
    resourceType: 'organization',
    resourceId: 'oSyH1iET5',
    limit: 10,
  })

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Sanity Organization Users
      </Heading>
      <Box paddingY={5}>
        <ol className="DocumentListLayout list-none" style={{gap: 2}}>
          {data.map((user) => (
            <li key={user.profile.id}>
              <Card width="fill" marginBottom={2}>
                <Flex align="center" gap={2} padding={2}>
                  <Avatar size={2} src={user.profile.imageUrl} />
                  <Box paddingY={2}>
                    <Flex direction="column" gap={1}>
                      <Text>{user.profile.displayName}</Text>
                      <Text muted>{user.profile.email}</Text>
                    </Flex>
                  </Box>
                </Flex>
              </Card>
            </li>
          ))}
          <LoadMore isPending={isPending} hasMore={hasMore} onLoadMore={loadMore} />
        </ol>
      </Box>
    </Box>
  )
}
