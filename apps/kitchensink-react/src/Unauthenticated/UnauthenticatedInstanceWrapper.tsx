import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react'
import {Box, Button, Card, Flex} from '@sanity/ui'
import {type JSX} from 'react'
import {Link, Outlet} from 'react-router'

const sanityInstance = createSanityInstance({
  projectId: 'ppsg7ml5',
  dataset: 'test',
})

export function UnauthenticatedInstanceWrapper(): JSX.Element {
  return (
    <SanityProvider sanityInstances={[sanityInstance]}>
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
    </SanityProvider>
  )
}
