import './App.css'

import {createClient} from '@sanity/client'
import {type SanityConfig} from '@sanity/sdk'
import {IntentHandlerPayload, IntentHandlers, SanityApp} from '@sanity/sdk-react'
import React from 'react'
import {BrowserRouter} from 'react-router'

import OverviewMap from './OverviewMap'

function AppWithRouter(): React.JSX.Element {
  const intentHandlers: IntentHandlers = {
    editScheduleState: {
      type: 'async',
      handler: async (payload: IntentHandlerPayload) => {
        const client = createClient({
          projectId: '9wmez61s',
          dataset: 'production',
          apiVersion: '2025-08-01',
          withCredentials: true,
          useCdn: false,
          apiHost: 'https://api.sanity.work',
        })
        await client
          .patch(payload.documentHandle.documentId)
          .set({status: payload.params?.['state']})
          .commit()
      },
    },
  }

  const sanityConfigs: SanityConfig[] = [
    {
      projectId: '9wmez61s',
      dataset: 'production',
      auth: {
        apiHost: 'https://api.sanity.work',
      },
      studioMode: {
        enabled: true, // Prevent redirect to Sanity core
      },
    },
  ]

  return (
    <div className="app-container">
      <SanityApp config={sanityConfigs} handlers={intentHandlers} fallback={<div>Loading...</div>}>
        <OverviewMap />
      </SanityApp>
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AppWithRouter />
    </BrowserRouter>
  )
}

export default App
