import './App.css'

import {type SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'
import React from 'react'

import OverviewMap from './OverviewMap'

function App(): React.JSX.Element {
  // apps can access many different projects or other sources of data
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
    <div className="app-container">
      <SanityApp config={sanityConfigs} fallback={<div>Loading...</div>}>
        <OverviewMap />
      </SanityApp>
    </div>
  )
}

export default App
