import {useUsers} from '@sanity/sdk-react'
import {type JSX} from 'react'

import {LoadMore} from '../components/LoadMore'
import {PageLayout} from '../components/PageLayout'
import {UserListItem} from '../components/UserListItem'

export function UsersRoute(): JSX.Element {
  const {data, hasMore, isPending, loadMore} = useUsers({batchSize: 10})

  return (
    <PageLayout title="Organization Users" subtitle={`${data.length} users loaded`}>
      <ol className="DocumentListLayout list-none" style={{gap: 2}}>
        {data.map((user) => (
          <li key={user.profile.id}>
            <UserListItem user={user} href={`/users/${user.profile.id}`} />
          </li>
        ))}
        <LoadMore isPending={isPending} hasMore={hasMore} onLoadMore={loadMore} />
      </ol>
    </PageLayout>
  )
}
