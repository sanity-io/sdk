import {Box, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {Link} from 'react-router'

export function UnauthenticatedHome({
  routes,
}: {
  routes: {path: string; element: JSX.Element}[]
}): JSX.Element {
  return (
    <Box style={{width: '100%'}}>
      <Container width={2} padding={7}>
        <Card padding={5} radius={3} shadow={1}>
          <Stack space={5}>
            <Box>
              <Heading as="h1" size={4} align="center">
                Unauthenticated
              </Heading>
              <Box marginTop={3}>
                <Text align="center" size={2} style={{color: '#6e7683'}}>
                  Explore unauthenticated components and examples
                </Text>
              </Box>
            </Box>

            <Flex direction="column" gap={3}>
              {routes.map((route) => (
                <Link key={route.path} to={route.path} style={{textDecoration: 'none'}}>
                  <Card padding={4} radius={3} tone="default" className="hover-card">
                    <Flex align="center" gap={3}>
                      <Text size={2} style={{color: '#f46b60'}}>
                        {route.path} <span className="arrow">→</span>
                      </Text>
                    </Flex>
                  </Card>
                </Link>
              ))}
            </Flex>
          </Stack>
        </Card>
      </Container>
    </Box>
  )
}
