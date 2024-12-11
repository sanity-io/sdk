import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/components'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {Suspense} from 'react'
import {BrowserRouter} from 'react-router'

import {AppRoutes} from './AppRoutes'

const theme = buildTheme({})
const sanityInstance = createSanityInstance({
  projectId: 'ppsg7ml5',
  dataset: 'test',
})

export function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <Suspense fallback={<Spinner />}>
        <SanityProvider sanityInstance={sanityInstance}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </SanityProvider>
      </Suspense>
    </ThemeProvider>
  )
}
