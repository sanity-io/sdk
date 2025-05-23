import {AuthBoundary, useLogOut} from '@sanity/sdk-react'
import {Button, Card, Flex, Text} from '@sanity/ui'
import {type JSX} from 'react'
import {Link} from 'react-router'

import {PageLayout} from '../components/PageLayout'

export function ProjectAuthHome({
  routes,
}: {
  routes: {path: string; element: JSX.Element}[]
}): JSX.Element {
  const logout = useLogOut()
  return (
    <PageLayout title="Authenticated" subtitle="Explore authentication examples and components">
      <AuthBoundary>
        <Flex direction="column" gap={3} data-testid="project-auth-home">
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
          <Button mode="ghost" onClick={() => logout()}>
            Logout
          </Button>
        </Flex>
      </AuthBoundary>
    </PageLayout>
  )
}
