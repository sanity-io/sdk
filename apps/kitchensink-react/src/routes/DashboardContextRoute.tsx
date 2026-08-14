import {useDashboardOrganizationId} from '@sanity/sdk-react'
import {Text} from '@sanity/ui'
import {type JSX} from 'react'

import {PageLayout} from '../components/PageLayout'

export function DashboardContextRoute(): JSX.Element {
  const orgId = useDashboardOrganizationId()

  return (
    <PageLayout title="Dashboard context" subtitle="Values inherited from the host dashboard">
      <Text size={1}>Organization ID: {orgId}</Text>
    </PageLayout>
  )
}
