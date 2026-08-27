import 'inter-ui/inter.css'
import './global.css'
import '@sanity/ui/styles.css'
// v5 is CSS-only and does not read the v4 theme. Keep v4's ThemeProvider.
import 'ui5/styles.css'

import {configureLogging, SanityApp} from '@sanity/sdk-react'
import {useNavigate} from '@sanity/sdk-react/dashboard'
import {ThemeProvider, usePrefersDark} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, type ReactNode, Suspense} from 'react'
import {BrowserRouter, useNavigate as useRouterNavigate} from 'react-router'
import {Spinner} from 'ui5'

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
  const navigate = useRouterNavigate()
  useNavigate(({path, type}) => {
    navigate(path, {replace: type === 'replace'})
  })
  return null
}

function ThemedApp({children}: {children: ReactNode}): JSX.Element {
  const prefersDark = usePrefersDark()
  return (
    <ThemeProvider scheme={prefersDark ? 'dark' : 'light'} theme={theme}>
      {children}
    </ThemeProvider>
  )
}

export default function App(): JSX.Element {
  return (
    <ThemedApp>
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
    </ThemedApp>
  )
}
