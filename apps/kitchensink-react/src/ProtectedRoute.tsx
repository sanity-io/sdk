import {AuthBoundary} from '@sanity/sdk-react/components'
import {useCurrentUser, useLogOut} from '@sanity/sdk-react/hooks'
import {Avatar, Button} from '@sanity/ui'
import {Link, Outlet} from 'react-router'

export function ProtectedRoute(): JSX.Element {
  const currentUser = useCurrentUser()
  const logout = useLogOut()

  return (
    <div style={{width: '100%', padding: '0 20px'}}>
      <AuthBoundary>
        <nav
          style={{
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link to="/">Home</Link>
          <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
            <Avatar src={currentUser?.profileImage} color="blue" />
            <span>{currentUser?.name}</span>
            <Button onClick={() => logout()}>Logout</Button>
          </div>
        </nav>

        <Outlet />
      </AuthBoundary>
    </div>
  )
}
