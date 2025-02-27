import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense} from 'react'
import {BrowserRouter} from 'react-router'

import {AppRoutes} from './AppRoutes'

const theme = buildTheme({})

export const SANITY_TEST_STUDIO_ID = 'document:ppsg7ml5:test' as const

export function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <Suspense fallback={<Spinner />}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </Suspense>
    </ThemeProvider>
  )
}
