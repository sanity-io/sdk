import {configureLogging, SanityApp, useDashboardNavigate} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense} from 'react'
import {BrowserRouter, useNavigate} from 'react-router'

import {AppRoutes} from './AppRoutes'
import {devConfigs, devSources, e2eConfigs} from './sanityConfigs'

// Enable SDK logging in the browser
configureLogging({
  level: 'debug',
  namespaces: ['*'], // Enable all namespaces
  internal: true, // Shows internal SDK operations (RxJS streams, store internals, etc.) when in trace mode
})

const theme = buildTheme({})

function NavigationHandler() {
  const navigate = useNavigate()
  useDashboardNavigate(({path, type}) => {
    navigate(path, {replace: type === 'replace'})
  })
  return null
}

export default function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <SanityApp
        fallback={<Spinner />}
        config={import.meta.env['VITE_IS_E2E'] ? e2eConfigs : devConfigs}
        sources={devSources}
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
