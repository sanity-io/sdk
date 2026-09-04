import {useOrganizationId} from '@sanity/sdk-react/dashboard'
import {type JSX} from 'react'
import {Text} from 'ui5'

import {PageLayout} from '../components/PageLayout'

export function DashboardContextRoute(): JSX.Element {
  const orgId = useOrganizationId()

  return (
    <PageLayout title="Dashboard context" subtitle="Values inherited from the host dashboard">
      <Text size={1}>Organization ID: {orgId}</Text>
    </PageLayout>
  )
}
