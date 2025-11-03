import {IntentLink, useIntentLink} from '@sanity/sdk-react'
import {Button, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import React, {Suspense} from 'react'

function SendIntentButton(): React.JSX.Element {
  const {onClick} = useIntentLink({
    intentAction: 'edit',
    resourceHandle: {
      documentId: 'ISWDzt74pwbeI4ifLERAKF',
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
      as="span"
      tone="primary"
      fontSize={2}
      padding={4}
      text="Edit Schedule"
      onClick={handleMaintenanceScheduleClick}
      style={{
        minWidth: 140,
      }}
    />
  )
}

export function IntentDisambiguation(): React.JSX.Element {
  return (
    <Container width={1} paddingY={6} style={{textAlign: 'center'}}>
      <Stack space={5}>
        <Heading as="h1">Intents Demos App</Heading>

        <Text>
          This app sends a maintenanceSchedule intent. Since both the property-detail-app and
          property-overview-app can handle this intent, the Dashboard should do something to let you
          choose which app should handle it.
        </Text>

        <Stack>
          <Card borderBottom borderTop paddingY={4}>
            <Flex justify="space-between" align="center" gap={5}>
              <Text align="left">
                Open all intents that can handle editing for the &ldquo;HVAC Service - 123 Oak
                Street&rdquo; maintenance schedule.
              </Text>

              <Suspense fallback={<div></div>}>
                <SendIntentButton />
              </Suspense>
            </Flex>
          </Card>

          <Card borderBottom paddingY={4}>
            <Flex justify="space-between" align="center" gap={5}>
              <Text align="left">
                Navigate directly to the &ldquo;Plumbing Check - 456 Pine Avenue&rdquo; maintenance
                schedule in the property-overview-app.
              </Text>

              <Suspense fallback={<div></div>}>
                <IntentLink
                  intentName="editScheduleState"
                  resourceHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLERAy7',
                    documentType: 'maintenanceSchedule',
                    projectId: '9wmez61s',
                    dataset: 'production',
                    type: 'document',
                  }}
                  style={{
                    minWidth: 140,
                  }}
                >
                  <Button
                    as="span"
                    width="fill"
                    tone="primary"
                    fontSize={2}
                    padding={4}
                    text="Edit Schedule"
                  />
                </IntentLink>
              </Suspense>
            </Flex>
          </Card>

          <Card borderBottom paddingY={4}>
            <Flex justify="space-between" align="center" gap={5}>
              <Text align="left">
                Open all intents that can handle editing for the &ldquo;123 Oak Street&rdquo;
                property.
              </Text>

              <Suspense fallback={<div></div>}>
                <IntentLink
                  resourceHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLER8da',
                    documentType: 'property',
                    projectId: '9wmez61s',
                    dataset: 'production',
                    type: 'document',
                  }}
                  style={{
                    minWidth: 140,
                    appearance: 'none',
                    padding: 0,
                    border: 'none',
                  }}
                >
                  <Button
                    as="span"
                    width="fill"
                    tone="primary"
                    fontSize={2}
                    padding={4}
                    text="Edit Property"
                  />
                </IntentLink>
              </Suspense>
            </Flex>
          </Card>

          <Card borderBottom paddingY={4}>
            <Flex justify="space-between" align="center" gap={5}>
              <Text align="left">
                Open all intents that can handle editing for the &ldquo;Check oven temperature
                accuracy&rdquo; maintenance task. Only studio should be available.
              </Text>

              <Suspense fallback={<div></div>}>
                <IntentLink
                  resourceHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLERD8g',
                    documentType: 'maintenanceTask',
                    projectId: '9wmez61s',
                    dataset: 'production',
                    type: 'document',
                  }}
                  style={{
                    minWidth: 140,
                    appearance: 'none',
                    padding: 0,
                    border: 'none',
                  }}
                >
                  <Button
                    as="span"
                    width="fill"
                    tone="primary"
                    fontSize={2}
                    padding={4}
                    text="Edit Task"
                  />
                </IntentLink>
              </Suspense>
            </Flex>
          </Card>
        </Stack>
      </Stack>
    </Container>
  )
}
