import {useAuthState, useCurrentUser, useLogOut} from '@sanity/sdk-react'
import {Avatar, Box, Button, Card, Flex} from '@sanity/ui'
import {type JSX} from 'react'
import {Link, Navigate, Outlet} from 'react-router'

export function ProtectedRoute({subPath}: {subPath: string}): JSX.Element {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const logout = useLogOut()

  if (authState.type !== 'logged-in') {
    return <Navigate to={subPath} replace />
  }

  return (
    <Box style={{width: '100%'}}>
      <Card shadow={1} padding={3}>
        <Flex as="nav" align="center" justify="space-between" paddingX={4}>
          <Flex gap={3}>
            <Link to="/" style={{textDecoration: 'none'}}>
              <Button mode="ghost" tone="primary" text="← Kitchen Sink Home" />
            </Link>
            <Link to={subPath} style={{textDecoration: 'none'}}>
              <Button mode="ghost" tone="primary" text="Home" />
            </Link>
          </Flex>

          <Flex align="center" gap={3}>
            <Avatar src={currentUser?.profileImage} size={1} />
            <Box as="span" style={{color: '#6e7683'}}>
              {currentUser?.name}
            </Box>
            <Button mode="ghost" tone="critical" onClick={() => logout()} text="Log out" />
          </Flex>
        </Flex>
      </Card>

      <Box padding={4}>
        <Outlet />
      </Box>
    </Box>
  )
}
