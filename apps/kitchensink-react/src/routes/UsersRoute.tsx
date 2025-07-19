import {useUsers} from '@sanity/sdk-react'
import {Box, Card, Flex, Text} from '@sanity/ui'
import {type JSX} from 'react'
import {Link} from 'react-router'

import {FallbackAvatar} from '../components/FallbackAvatar'
import {PageLayout} from '../components/PageLayout'
import {LoadMore} from '../DocumentCollection/LoadMore'

export function UsersRoute(): JSX.Element {
  const {data, hasMore, isPending, loadMore} = useUsers({batchSize: 10})

  return (
    <PageLayout title="Organization Users" subtitle={`${data.length} users loaded`}>
      <ol className="DocumentListLayout list-none" style={{gap: 2}}>
        {data.map((user) => (
          <li key={user.profile.id}>
            <Link to={`/users/${user.profile.id}`} style={{textDecoration: 'none'}}>
              <Card width="fill" marginBottom={2} style={{cursor: 'pointer'}} tone="inherit">
                <Flex align="center" gap={2} padding={2}>
                  <FallbackAvatar
                    size={2}
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
            </Link>
          </li>
        ))}
        <LoadMore isPending={isPending} hasMore={hasMore} onLoadMore={loadMore} />
      </ol>
    </PageLayout>
  )
}
