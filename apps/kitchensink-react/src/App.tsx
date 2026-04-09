import {configureLogging, SanityApp, useDashboardNavigate} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense} from 'react'
import {BrowserRouter, useNavigate} from 'react-router'

import {resources} from '../.sanity/resources'
import {AppRoutes} from './AppRoutes'
import {devConfig, e2eConfig} from './sanityConfigs'

const theme = buildTheme({})

function NavigationHandler() {
  const navigate = useNavigate()
  useDashboardNavigate(({path, type}) => {
    navigate(path, {replace: type === 'replace'})
  })
  return null
}

configureLogging({
  level: 'debug',
  namespaces: ['telemetry'],
})

export default function App(): JSX.Element {
  const isE2E = import.meta.env['VITE_IS_E2E']
  return (
    <ThemeProvider theme={theme}>
      <SanityApp
        fallback={<Spinner />}
        config={isE2E ? e2eConfig : devConfig}
        inferMediaLibraryAndCanvas
        resources={resources}
      >
        <BrowserRouter>
          <Suspense>
            <NavigationHandler />
          </Suspense>
          <AppRoutes />
        </BrowserRouter>
      </SanityApp>
    </ThemeProvider>
  )
}
