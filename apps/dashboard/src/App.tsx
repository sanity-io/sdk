import {SanityApp, SanityConfig} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense} from 'react'

const theme = buildTheme({})

const devConfigs: SanityConfig[] = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  {
    projectId: 'd45jg133',
    dataset: 'production',
  },
  {
    projectId: 'v28v5k8m',
    dataset: 'production',
  },
]

export default function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <SanityApp fallback={<Spinner />} config={devConfigs}>
        <Suspense>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{padding: 12, borderBottom: '1px solid #eee'}}>
              Dashboard (iframes sdk-app below)
            </div>
            <iframe
              title="sdk-app"
              src="http://localhost:3341/"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
              }}
            />
          </div>
        </Suspense>
      </SanityApp>
    </ThemeProvider>
  )
}
