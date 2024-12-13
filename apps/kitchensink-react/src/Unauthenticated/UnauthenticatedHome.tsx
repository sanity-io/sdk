import {Box, Card, Container, Heading, Text} from '@sanity/ui'
import {Link} from 'react-router'

export function UnauthenticatedHome({
  routes,
}: {
  routes: {path: string; element: JSX.Element}[]
}): JSX.Element {
  return (
    <Container width={1} padding={7}>
      <Box marginBottom={6}>
        <Heading as="h1" size={5} align="center">
          Unauthenticated
        </Heading>
      </Box>
      <Box marginY={5}>
        <Card border radius={3} padding={4}>
          <Heading as="h4" size={2}>
            Components
          </Heading>
          <Box marginTop={5}>
            <ul style={{listStyle: 'none'}}>
              {routes.map((route) => (
                <li key={route.path}>
                  <Link to={route.path}>
                    <Box paddingY={2} display="inline-block">
                      <Text style={{textDecoration: 'underline'}}>{route.path} &rarr;</Text>
                    </Box>
                  </Link>
                </li>
              ))}
            </ul>
          </Box>
        </Card>
      </Box>
    </Container>
  )
}
