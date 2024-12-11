import {LoginLinks} from '@sanity/sdk-react/components'
import {useAuthState, useCurrentUser, useLogOut} from '@sanity/sdk-react/hooks'
import {Avatar, Button, Container, Heading} from '@sanity/ui'
import {Link} from 'react-router'

export function AuthPlayground({
  routes,
}: {
  routes: {path: string; element: JSX.Element}[]
}): JSX.Element {
  const currentUser = useCurrentUser()
  const authState = useAuthState()
  const logout = useLogOut()

  return (
    <>
      <Container width={0}>
        <Heading as="h1" size={5} style={{marginBottom: 24}}>
          React Kitchensink
        </Heading>
      </Container>
      {authState.type === 'logged-in' ? (
        <>
          <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
            <Avatar src={currentUser?.profileImage} color="blue" />{' '}
            <span>Welcome {currentUser?.name}</span>
            <Button onClick={() => logout()}>Logout</Button>
          </div>
          <div>
            <Heading as="h4" size={2}>
              Routes
            </Heading>
            <ul>
              {routes.map((route) => (
                <li key={route.path}>
                  <Link to={route.path}>{route.path}</Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <LoginLinks />
      )}
    </>
  )
}
