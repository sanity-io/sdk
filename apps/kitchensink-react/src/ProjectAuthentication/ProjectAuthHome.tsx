import {AuthBoundary, useLogOut} from '@sanity/sdk-react'
import {Button, Card, Stack, Text} from '@sanity/ui'
import {type JSX} from 'react'

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
        <Stack data-testid="project-auth-home" gap={4}>
          <Card padding={4} radius={2} tone="transparent" border>
            <Stack gap={3}>
              <Text size={1}>
                Use the sidebar to open an example. {routes.length} routes are registered.
              </Text>
              <Text muted size={1}>
                These screens exercise real-time documents, permissions, releases, presence, and
                dashboard hooks.
              </Text>
            </Stack>
          </Card>
          <Button mode="ghost" onClick={() => logout()} text="Logout" />
        </Stack>
      </AuthBoundary>
    </PageLayout>
  )
}
