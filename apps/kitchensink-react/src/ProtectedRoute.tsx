import {useAuthState, useCurrentUser, useLogOut} from '@sanity/sdk-react/hooks'
import {Avatar, Button, Flex} from '@sanity/ui'
import {Link, Navigate, Outlet} from 'react-router'

export function ProtectedRoute({subPath}: {subPath: string}): JSX.Element {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const logout = useLogOut()

  if (authState.type !== 'logged-in') {
    return <Navigate to={subPath} replace />
  }

  return (
    <div style={{width: '100%', padding: '0 20px'}}>
      <Flex as="nav" align="center" justify="space-between" paddingY={3}>
        <Link to="/">Kitchen Sink Home</Link>
        <Link to={subPath}>Home</Link>
        <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
          <Avatar src={currentUser?.profileImage} color="blue" />
          <span>{currentUser?.name}</span>
          <Button mode="ghost" onClick={() => logout()}>
            Log out
          </Button>
        </div>
      </Flex>

      <Outlet />
    </div>
  )
}
