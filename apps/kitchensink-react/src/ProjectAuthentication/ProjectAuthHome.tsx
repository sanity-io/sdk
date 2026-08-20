import {AuthBoundary, useLogOut} from '@sanity/sdk-react'
import {type JSX} from 'react'
import {Button, Card, Text, VStack} from 'ui5'

import {PageLayout} from '../components/PageLayout'

export function ProjectAuthHome({
  routes,
}: {
  routes: {path: string; element: JSX.Element}[]
}): JSX.Element {
  const logout = useLogOut()
  return (
    <PageLayout title="Kitchen Sink" subtitle="Sanity App SDK examples">
      <AuthBoundary>
        <VStack data-testid="project-auth-home" gap={4}>
          <Card density="regular">
            <VStack gap={3}>
              <Text size={1}>
                Use the sidebar to open an example. {routes.length} routes are registered.
              </Text>
              <Text muted size={1}>
                These screens exercise real-time documents, permissions, releases, presence, and
                dashboard hooks.
              </Text>
            </VStack>
          </Card>
          <Button level="tertiary" onClick={() => logout()} text="Logout" />
        </VStack>
      </AuthBoundary>
    </PageLayout>
  )
}
