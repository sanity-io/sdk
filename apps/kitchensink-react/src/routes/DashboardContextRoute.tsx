import {useOrganizationId} from '@sanity/sdk-react/dashboard'
import {Box, Heading, Text} from '@sanity/ui'
import {type JSX} from 'react'

export function DashboardContextRoute(): JSX.Element {
  const orgId = useOrganizationId()

  return (
    <Box padding={4}>
      <Heading as="h1" size={5}>
        Dashboard Context
      </Heading>
      <Box paddingY={5}>
        <Text>Organization ID: {orgId}</Text>
      </Box>
    </Box>
  )
}
