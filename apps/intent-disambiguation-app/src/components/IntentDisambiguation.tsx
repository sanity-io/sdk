import {IntentLink, useIntentLink} from '@sanity/sdk-react'
import {Button, Container, Heading, Stack, Text} from '@sanity/ui'
import React, {Suspense} from 'react'

function SendIntentButton(): React.JSX.Element {
  const {onClick} = useIntentLink({
    resourceHandle: {
      documentId: 'ISWDzt74pwbeI4ifLERDca',
      documentType: 'maintenanceSchedule',
      projectId: '9wmez61s',
      dataset: 'production',
      type: 'document',
    },
  })

  const handleMaintenanceScheduleClick = () => {
    console.log('Sending maintenanceSchedule intent - this should trigger disambiguation')
    onClick()
  }

  return (
    <Button
      onClick={handleMaintenanceScheduleClick}
      tone="primary"
      fontSize={2}
      padding={4}
      text="Send Maintenance Schedule Intent"
    />
  )
}

export function IntentDisambiguation(): React.JSX.Element {
  return (
    <Container width={1} paddingY={6} style={{textAlign: 'center'}}>
      <Stack space={5}>
        <Heading as="h1">Intent Disambiguation App</Heading>

        <Text>
          This app sends a maintenanceSchedule intent. Since both the property-detail-app and
          property-overview-app can handle this intent, the Dashboard should do something to let you
          choose which app should handle it.
        </Text>

        <Container width={0} paddingX={7}>
          <Stack space={4}>
            <Suspense fallback={<div>Loading intent sender...</div>}>
              <SendIntentButton />
            </Suspense>

            <Suspense fallback={<div></div>}>
              <IntentLink
                intentName="editScheduleState"
                resourceHandle={{
                  documentId: 'ISWDzt74pwbeI4ifLERDca',
                  documentType: 'maintenanceSchedule',
                  projectId: '9wmez61s',
                  dataset: 'production',
                  type: 'document',
                }}
              >
                <Button
                  as="span"
                  width="fill"
                  tone="primary"
                  fontSize={2}
                  padding={4}
                  text="Send Maintenance Schedule Edit Intent"
                />
              </IntentLink>
            </Suspense>
          </Stack>
        </Container>
      </Stack>
    </Container>
  )
}
