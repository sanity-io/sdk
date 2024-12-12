import {AuthBoundary} from '@sanity/sdk-react/components'
import {Container, Heading} from '@sanity/ui'
import {Link} from 'react-router'

export function AuthPlayground({
  routes,
}: {
  routes: {path: string; element: JSX.Element}[]
}): JSX.Element {
  return (
    <>
      <Container width={0}>
        <Heading as="h1" size={5} style={{marginBottom: 24}}>
          React Kitchensink
        </Heading>
        <AuthBoundary>
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
        </AuthBoundary>
      </Container>
    </>
  )
}
