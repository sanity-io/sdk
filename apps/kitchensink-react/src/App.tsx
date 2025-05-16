import {SanityApp, SanityConfig, useDashboardNavigate} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense} from 'react'
import {BrowserRouter, useNavigate} from 'react-router'

import {AppRoutes} from './AppRoutes'

const theme = buildTheme({})

const sanityConfigs: SanityConfig[] = [
  // {
  //   projectId: 'project-id',
  //   dataset: 'data-set',
  // },
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  {
    projectId: 'd45jg133',
    dataset: 'production',
  },
]

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
      <SanityApp fallback={<Spinner />} config={sanityConfigs}>
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
