import {AuthBoundary} from '@sanity/sdk-react/components'
import {Card, Flex, Text} from '@sanity/ui'
import {Link} from 'react-router'

import {PageLayout} from '../components/PageLayout'

export function CosuiAppHome({
  routes,
}: {
  routes: {path: string; element: JSX.Element}[]
}): JSX.Element {
  return (
    <PageLayout
      title="COSUi App"
      subtitle="Explore authentication examples and components"
      homePath="/cosui-app"
      homeText="COSUi App Home"
      hideNav
    >
      <AuthBoundary>
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
      </AuthBoundary>
    </PageLayout>
  )
}
