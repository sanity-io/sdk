import {ResourceProvider} from '@sanity/sdk-react'
import {Box, Button, Card, Flex, Spinner} from '@sanity/ui'
import {type JSX} from 'react'
import {Link, Outlet} from 'react-router'

export function UnauthenticatedInstanceWrapper(): JSX.Element {
  return (
    <ResourceProvider projectId="ppsg7ml5" dataset="test" fallback={<Spinner />}>
      <Box style={{width: '100%'}}>
        <Card shadow={1} padding={3}>
          <Flex as="nav" align="center" justify="space-between" paddingX={4}>
            <Link to="/" style={{textDecoration: 'none'}}>
              <Button mode="ghost" tone="primary" text="← Kitchen Sink Home" />
            </Link>
            <Link to="/unauthenticated" style={{textDecoration: 'none'}}>
              <Button mode="ghost" tone="primary" text="Unauthenticated Home" />
            </Link>
          </Flex>
        </Card>

        <Box padding={4}>
          <Outlet />
        </Box>
      </Box>
    </ResourceProvider>
  )
}
