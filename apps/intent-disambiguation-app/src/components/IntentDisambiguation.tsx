import {useIntentLink} from '@sanity/sdk-react'
import {Button, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {ResourceHandle} from 'packages/react/src/hooks/dashboard/useIntentLink'
import React, {Suspense} from 'react'

function SendIntentButton({
  intentAction,
  intentName,
  resourceHandle,
  params,
  cta,
}: {
  intentAction?: string
  intentName?: string
  resourceHandle: ResourceHandle
  params?: Record<string, string>
  cta: string
}): React.JSX.Element {
  const {onClick} = useIntentLink({
    ...(intentAction && {intentAction}),
    ...(intentName && {intentName}),
    ...(params && {params}),
    resourceHandle,
  })

  const handleClick = () => {
    console.log(`Sending ${intentAction || intentName} intent - this should trigger disambiguation`)
    onClick()
  }

  return (
    <Button
      tone="primary"
      fontSize={2}
      padding={4}
      text={cta}
      onClick={handleClick}
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
          This app provides sample intents triggers that allow for easier navigation between the
          property-detail-app, property-overview-app, or studio. These can be set up to either
          navigate directly by intent name or display a picker for disambiguation.
        </Text>

        <Stack>
          <Card borderBottom borderTop paddingY={4}>
            <Flex justify="space-between" align="center" gap={5}>
              <Text align="left">
                Open all intents that can handle editing for the &ldquo;HVAC Service - 123 Oak
                Street&rdquo; maintenance schedule.
              </Text>

              <Suspense fallback={<div></div>}>
                <SendIntentButton
                  intentAction="edit"
                  resourceHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLERAKF',
                    documentType: 'maintenanceSchedule',
                    projectId: '9wmez61s',
                    dataset: 'production',
                    type: 'document',
                  }}
                  cta="Edit Schedule"
                />
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
                <SendIntentButton
                  intentName="editScheduleState"
                  resourceHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLERAy7',
                    documentType: 'maintenanceSchedule',
                    projectId: '9wmez61s',
                    dataset: 'production',
                    type: 'document',
                  }}
                  cta="Edit Schedule"
                />
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
                <SendIntentButton
                  resourceHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLER8da',
                    documentType: 'property',
                    projectId: '9wmez61s',
                    dataset: 'production',
                    type: 'document',
                  }}
                  cta="Edit Schedule"
                />
              </Suspense>
            </Flex>
          </Card>

          <Card borderBottom paddingY={4}>
            <Flex justify="space-between" align="center" gap={5}>
              <Text align="left">
                Navigate directly to the &ldquo;Check oven temperature accuracy&rdquo; maintenance
                task in the studio.
              </Text>

              <Suspense fallback={<div></div>}>
                <SendIntentButton
                  intentName="studio.j8q720b38239y746e1ho73tj-default"
                  resourceHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLERD8g',
                    documentType: 'maintenanceTask',
                    projectId: '9wmez61s',
                    dataset: 'production',
                    type: 'document',
                  }}
                  cta="Edit Task"
                />
              </Suspense>
            </Flex>
          </Card>

          {/* <Card borderBottom paddingY={4}>
            <Flex justify="space-between" align="center" gap={5}>
              <Text align="left">
                Note: due to config issues with the property intents studio and the agent, this
                example uses the staging studio. Navigate directly to the &ldquo;Test Book
                test!&rdquo; book and open the agent with a prompt.
              </Text>

              <Suspense fallback={<div></div>}>
                <SendIntentButton
                  intentName="agent.z4vzpzd7f3ff7p0vynin2aj6-staging"
                  resourceHandle={{
                    documentId: '49d3293d-f656-4f74-95c3-7bc2488442b9',
                    documentType: 'book',
                    projectId: 'exx11uqh',
                    dataset: 'playground',
                    type: 'document',
                  }}
                  params={{
                    prompt: 'Show me the genre options for this book.',
                  }}
                  cta="Edit Book"
                />
              </Suspense>
            </Flex>
          </Card> */}
        </Stack>
      </Stack>
    </Container>
  )
}
