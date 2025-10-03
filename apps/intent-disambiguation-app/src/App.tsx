import './App.css'

import {type SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'
import React from 'react'
import {BrowserRouter} from 'react-router'

import {IntentDisambiguation} from './components/IntentDisambiguation'
import {LoadingFallback} from './components/LoadingFallback'

function AppWithRouter(): React.JSX.Element {
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
    <SanityApp config={sanityConfigs} fallback={<LoadingFallback />}>
      <IntentDisambiguation />
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
