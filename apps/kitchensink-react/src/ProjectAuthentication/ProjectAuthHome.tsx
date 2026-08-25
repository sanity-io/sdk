import {getIsInDashboardState} from '@sanity/sdk'
import {AuthBoundary, useSanityInstance} from '@sanity/sdk-react'
import {type JSX, useMemo, useSyncExternalStore} from 'react'
import {Button, Card, Text, VStack} from 'ui5'

import {PageLayout} from '../components/PageLayout'

const DASHBOARD_ORG_ID = 'oblZgbTFj'

function useIsInDashboard(): boolean {
  const instance = useSanityInstance()
  const {subscribe, getCurrent} = useMemo(() => getIsInDashboardState(instance), [instance])
  return useSyncExternalStore(subscribe, getCurrent)
}

function dashboardDevUrl(): string {
  return `https://www.sanity.io/@${DASHBOARD_ORG_ID}?dev=${encodeURIComponent(window.location.origin)}`
}

export function ProjectAuthHome(): JSX.Element {
  const isInDashboard = useIsInDashboard()

  return (
    <PageLayout
      title="Kitchen Sink"
      subtitle="A host app for trying @sanity/sdk-react against a live project"
    >
      <AuthBoundary>
        <VStack data-testid="project-auth-home" gap={4}>
          <Card density="regular">
            <VStack gap={3}>
              {!isInDashboard && (
                <>
                  <Text size={1}>This app is meant to run inside the Sanity dashboard.</Text>
                  <Button
                    as="a"
                    href={dashboardDevUrl()}
                    level="secondary"
                    text="Open in Dashboard"
                  />
                </>
              )}
              <Text size={1}>
                Each page in the menus above is a small example built around one hook or workflow.
              </Text>
              <Text muted size={1}>
                Changes you make here write to the configured project. Treat it like a real dataset.
              </Text>
            </VStack>
          </Card>
        </VStack>
      </AuthBoundary>
    </PageLayout>
  )
}
