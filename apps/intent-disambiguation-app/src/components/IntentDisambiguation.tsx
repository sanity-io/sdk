import {useSendIntent} from '@sanity/sdk-react'
import React, {Suspense} from 'react'

function SendIntentButton({
  cta,
  intentName,
}: {
  cta: string
  intentName?: string
}): React.JSX.Element {
  const {sendIntent, href} = useSendIntent({
    ...(intentName && {intentName}),
    documentHandle: {
      documentId: 'maintenance-schedule-123',
      documentType: 'maintenanceSchedule',
      projectId: '9wmez61s',
      dataset: 'production',
    },
  })

  const handleMaintenanceScheduleClick = (e: React.MouseEvent<HTMLElement>) => {
    console.log('Sending maintenanceSchedule intent - this should trigger disambiguation')
    sendIntent(e)
  }

  return (
    <a className="maintenance-schedule-button" onClick={handleMaintenanceScheduleClick} href={href}>
      {cta}
    </a>
  )
}

export function IntentDisambiguation(): React.JSX.Element {
  return (
    <div className="app-container">
      <div className="intent-disambiguation">
        <h1>Intent Disambiguation App</h1>
        <p>
          This app sends a maintenanceSchedule intent. Since both the property-detail-app and
          property-overview-app can handle this intent, the Dashboard should do something to let you
          choose which app should handle it.
        </p>

        <p>
          <Suspense fallback={<span>Loading intent sender...</span>}>
            <SendIntentButton cta="Send Maintenance Schedule Intent" />
          </Suspense>
        </p>

        <p>
          <SendIntentButton cta="Direct Edit Intent Link" intentName="editScheduleState" />
        </p>
      </div>
    </div>
  )
}
