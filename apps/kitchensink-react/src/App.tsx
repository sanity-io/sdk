import {SanityApp, useDashboardNavigate} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense} from 'react'
import {BrowserRouter, useNavigate} from 'react-router'

import {AppRoutes} from './AppRoutes'
import {devConfig, devSources, e2eConfig, e2eSources} from './sanityConfigs'

const theme = buildTheme({})

function NavigationHandler() {
  const navigate = useNavigate()
  useDashboardNavigate(({path, type}) => {
    navigate(path, {replace: type === 'replace'})
  })
  return null
}

export default function App(): JSX.Element {
  const isE2E = import.meta.env['VITE_IS_E2E']
  return (
    <ThemeProvider theme={theme}>
      <SanityApp
        fallback={<Spinner />}
        config={isE2E ? e2eConfig : devConfig}
        sources={isE2E ? e2eSources : devSources}
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
