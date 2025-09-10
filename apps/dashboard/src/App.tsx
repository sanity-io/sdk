import {createSubscriptionRequest, registerSubscription, unregisterSubscription} from '@sanity/sdk'
import {SanityApp, SanityConfig} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense, useState} from 'react'

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

// SharedWorker test component
function SharedWorkerTest() {
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Ready to test')

  const testSubscription = async () => {
    // eslint-disable-next-line no-console
    console.log('testSubscription')
    try {
      setStatus('Testing subscription...')

      const subscription = createSubscriptionRequest({
        storeName: 'query',
        projectId: 'ppsg7ml5',
        dataset: 'test',
        params: {
          query: '*[_type == "movie"]',
          options: {},
        },
        appId: 'dashboard-app',
      })

      const id = await registerSubscription(subscription)
      setSubscriptionId(id)
      setStatus(`Subscription registered: ${id}`)
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const testUnsubscription = async () => {
    if (!subscriptionId) return

    try {
      setStatus('Testing unsubscription...')

      await unregisterSubscription(subscriptionId)
      setSubscriptionId(null)
      setStatus('Subscription unregistered successfully')
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div style={{padding: 12, borderBottom: '1px solid #eee'}}>
      <div>Dashboard (iframes sdk-app below)</div>
      <div style={{marginTop: 8, fontSize: '14px'}}>
        <div>SharedWorker Test:</div>
        <div style={{marginTop: 4}}>
          <button onClick={testSubscription} disabled={!!subscriptionId}>
            Test Subscription
          </button>
          {subscriptionId && (
            <button onClick={testUnsubscription} style={{marginLeft: 8}}>
              Test Unsubscription
            </button>
          )}
        </div>
        <div style={{marginTop: 4, fontFamily: 'monospace', fontSize: '12px'}}>
          Status: {status}
        </div>
        {subscriptionId && (
          <div style={{marginTop: 4, fontFamily: 'monospace', fontSize: '12px'}}>
            Active Subscription: {subscriptionId}
          </div>
        )}
      </div>
    </div>
  )
}

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
            <SharedWorkerTest />
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
