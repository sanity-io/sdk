import {useSendIntent} from '@sanity/sdk-react'
import React, {Suspense} from 'react'

function SendIntentButton(): React.JSX.Element {
  const {sendIntent} = useSendIntent({
    documentHandle: {
      documentId: 'maintenance-schedule-123',
      documentType: 'maintenanceSchedule',
      projectId: '9wmez61s',
      dataset: 'production',
    },
  })

  const handleMaintenanceScheduleClick = () => {
    console.log('Sending maintenanceSchedule intent - this should trigger disambiguation')
    sendIntent()
  }

  return (
    <button className="maintenance-schedule-button" onClick={handleMaintenanceScheduleClick}>
      Send Maintenance Schedule Intent
    </button>
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
        <Suspense fallback={<div>Loading intent sender...</div>}>
          <SendIntentButton />
        </Suspense>
      </div>
    </div>
  )
}
