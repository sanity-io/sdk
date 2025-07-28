import './App.css'

import {type SanityConfig} from '@sanity/sdk'
import {type IntentHandlerPayload, type IntentHandlers, SanityApp} from '@sanity/sdk-react'
import React from 'react'
import {BrowserRouter, useNavigate} from 'react-router'

import {AppRoutes} from './AppRoutes'
import {CompleteAllTasks} from './components/CompleteAllTasks'
import {LoadingFallback} from './components/LoadingFallback'

function AppWithRouter(): React.JSX.Element {
  const navigate = useNavigate()

  const intentHandlers: IntentHandlers = {
    maintenanceList: {
      type: 'async',
      handler: async (payload: IntentHandlerPayload) => {
        if (payload.documentHandle) {
          navigate(`/property/${payload.documentHandle.documentId}`)
        }
      },
    },
    completeAllTasks: {
      type: 'component',
      handler: CompleteAllTasks,
      // Hide the app completely for this bulk operation - shows only our component
      hideApp: true,
    },
  }

  const sanityConfigs: SanityConfig[] = [
    {
      projectId: '9wmez61s',
      dataset: 'production',
      auth: {
        apiHost: 'https://api.sanity.work',
      },
    },
  ]

  return (
    <SanityApp config={sanityConfigs} handlers={intentHandlers} fallback={<LoadingFallback />}>
      <AppRoutes />
    </SanityApp>
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
