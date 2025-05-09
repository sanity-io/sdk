import {SanityApp, SanityConfig} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX} from 'react'
import {BrowserRouter} from 'react-router'

import {AppRoutes} from './AppRoutes'

const theme = buildTheme({})

const sanityConfigs: SanityConfig[] = [
  {
    projectId: 'project-id',
    dataset: 'data-set',
  },
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  {
    projectId: 'ezwd8xes',
    dataset: 'production',
  },
]

export function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <SanityApp fallback={<Spinner />} config={sanityConfigs}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SanityApp>
    </ThemeProvider>
  )
}
