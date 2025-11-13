import {canvasSource, type DocumentHandleWithSource, useDispatchIntent} from '@sanity/sdk-react'
import {Button, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import React, {Suspense} from 'react'

function SendIntentButton({
  action,
  intentId,
  documentHandle,
  parameters,
  cta,
}: {
  action?: 'edit'
  intentId?: string
  documentHandle: DocumentHandleWithSource
  parameters?: Record<string, unknown>
  cta: string
}): React.JSX.Element {
  const {dispatchIntent} = useDispatchIntent({
    ...(action && {action}),
    ...(intentId && {intentId}),
    ...(parameters && {parameters}),
    documentHandle,
  })

  const handleClick = () => {
    console.log(`Sending ${action || intentId} intent`)
    dispatchIntent()
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
                  action="edit"
                  documentHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLERAKF',
                    documentType: 'maintenanceSchedule',
                    projectId: '9wmez61s',
                    dataset: 'production',
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
                  intentId="editScheduleState"
                  documentHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLERAy7',
                    documentType: 'maintenanceSchedule',
                    projectId: '9wmez61s',
                    dataset: 'production',
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
                  action="edit"
                  documentHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLER8da',
                    documentType: 'property',
                    projectId: '9wmez61s',
                    dataset: 'production',
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
                  intentId="studio.j8q720b38239y746e1ho73tj-default"
                  documentHandle={{
                    documentId: 'ISWDzt74pwbeI4ifLERD8g',
                    documentType: 'maintenanceTask',
                    projectId: '9wmez61s',
                    dataset: 'production',
                  }}
                  cta="Edit Task"
                />
              </Suspense>
            </Flex>
          </Card>

          <Card borderBottom paddingY={4}>
            <Flex justify="space-between" align="center" gap={5}>
              <Text align="left">
                Navigate directly to &ldquo;Welcome to Sanity Canvas&rdquo; in Canvas.
              </Text>

              <Suspense fallback={<div></div>}>
                <SendIntentButton
                  intentId="canvas.edit"
                  documentHandle={{
                    documentId: 'TUJo78GZr52XcbxuwWUlzQ',
                    documentType: 'sanity.canvas.document',
                    source: canvasSource('TUJo78GZr52XcbxuwWUlzQ'),
                  }}
                  cta="Edit Canvas"
                />
              </Suspense>
            </Flex>
          </Card>
        </Stack>
      </Stack>
    </Container>
  )
}
