import {useAuthState, useCurrentUser, useLogOut} from '@sanity/sdk-react/hooks'
import {Avatar, Button} from '@sanity/ui'
import {Link, Navigate, Outlet} from 'react-router'

export function ProtectedRoute(): JSX.Element {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const logout = useLogOut()

  if (authState.type !== 'logged-in') {
    return <Navigate to="/" replace />
  }

  return (
    <div style={{width: '100%', padding: '0 20px'}}>
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
    </div>
  )
}
