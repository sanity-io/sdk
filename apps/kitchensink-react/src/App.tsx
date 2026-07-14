import './global.css'

import {configureLogging, SanityApp, useDashboardNavigate} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense} from 'react'
import {BrowserRouter, useNavigate} from 'react-router'

import {AppRoutes} from './AppRoutes'
import {devResources, e2eResources, isE2E} from './sanityConfigs'

// Enable SDK logging in the browser. The wildcard picks up new namespaces
// automatically as logging is added to more modules.
configureLogging({
  level: 'debug',
  namespaces: ['*'],
  internal: true, // also show logs flagged as internal/maintainer-level
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
        config={isE2E ? {auth: {apiHost: 'https://api.sanity.work'}} : {}}
        resources={isE2E ? e2eResources : devResources}
        inferMediaLibraryAndCanvas
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
