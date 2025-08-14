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
    try {
      setStatus('Testing subscription...')

      const worker = (window as any).subscriptionWorker
      if (!worker) {
        throw new Error('SharedWorker not available')
      }

      const subscription = {
        subscriptionId: `test-${Date.now()}`,
        storeName: 'query',
        projectId: 'ppsg7ml5',
        dataset: 'test',
        params: {
          query: '*[_type == "movie"]',
          options: {},
        },
        appId: 'dashboard-app',
      }

      // Send message to SharedWorker
      const promise = new Promise<string>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
          const {type, data} = event.data
          if (
            type === 'SUBSCRIPTION_REGISTERED' &&
            data.subscriptionId === subscription.subscriptionId
          ) {
            worker.port.removeEventListener('message', handler)
            resolve(data.subscriptionId)
          } else if (type === 'SUBSCRIPTION_ERROR') {
            worker.port.removeEventListener('message', handler)
            reject(new Error(data.error))
          }
        }
        worker.port.addEventListener('message', handler)
      })

      worker.port.postMessage({
        type: 'REGISTER_SUBSCRIPTION',
        data: subscription,
      })

      const id = await promise
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

      const worker = (window as any).subscriptionWorker
      if (!worker) {
        throw new Error('SharedWorker not available')
      }

      // Send message to SharedWorker
      const promise = new Promise<void>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
          const {type, data} = event.data
          if (type === 'SUBSCRIPTION_UNREGISTERED' && data.subscriptionId === subscriptionId) {
            worker.port.removeEventListener('message', handler)
            resolve()
          } else if (type === 'SUBSCRIPTION_ERROR') {
            worker.port.removeEventListener('message', handler)
            reject(new Error(data.error))
          }
        }
        worker.port.addEventListener('message', handler)
      })

      worker.port.postMessage({
        type: 'UNREGISTER_SUBSCRIPTION',
        data: {subscriptionId},
      })

      await promise
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
