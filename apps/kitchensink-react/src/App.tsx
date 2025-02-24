import {Flex, Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense} from 'react'
import {BrowserRouter} from 'react-router'

import {AppRoutes} from './AppRoutes'

const theme = buildTheme({})

export function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <Suspense
        fallback={
          <Flex style={{width: '100vw', height: '100vh'}} justify="center" align="center">
            <Spinner size={4} />
          </Flex>
        }
      >
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </Suspense>
    </ThemeProvider>
  )
}
