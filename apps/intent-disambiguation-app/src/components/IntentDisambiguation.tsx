import {useIntentButton, useIntentLink} from '@sanity/sdk-react'
import React, {Suspense} from 'react'

function SendIntentButton(): React.JSX.Element {
  const {onClick} = useIntentButton({
    documentHandle: {
      documentId: 'ISWDzt74pwbeI4ifLERDca',
      documentType: 'maintenanceSchedule',
      projectId: '9wmez61s',
      dataset: 'production',
    },
  })

  const handleMaintenanceScheduleClick = () => {
    console.log('Sending maintenanceSchedule intent - this should trigger disambiguation')
    onClick()
  }

  return (
    <button className="maintenance-schedule-button" onClick={handleMaintenanceScheduleClick}>
      Send Maintenance Schedule Intent
    </button>
  )
}

function SendIntentLink(): React.JSX.Element {
  const intentLink = useIntentLink({
    intentName: 'editScheduleState',
    documentHandle: {
      documentId: 'ISWDzt74pwbeI4ifLERDca',
      documentType: 'maintenanceSchedule',
      projectId: '9wmez61s',
      dataset: 'production',
    },
    // params: {
    //   view: 'grid',
    // },
  })

  return (
    <a className="maintenance-schedule-button" {...intentLink}>
      Send Maintenance Schedule Edit Intent
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
            <SendIntentButton />
          </Suspense>
        </p>

        <p>
          <SendIntentLink />
        </p>
      </div>
    </div>
  )
}
