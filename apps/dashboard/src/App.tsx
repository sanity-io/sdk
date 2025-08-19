import {SanityApp, SanityConfig, useFrameConnection} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX, Suspense, useState, useEffect, useRef, useCallback} from 'react'
import {registerSubscription, unregisterSubscription, createSubscriptionRequest} from '@sanity/sdk'

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

// Message types for iframe communication
type QueryRequestMessage = {
  type: 'dashboard/v1/query/request'
  data: {
    queryId: string
    queryOptions: any
    requestId: string
  }
}

type QueryResponseMessage = {
  type: 'dashboard/v1/query/response'
  data: {
    requestId: string
    data: unknown
    error?: string
    subscriptionId: string
  }
}

// SharedWorker test component
function SharedWorkerTest({iframeRef}: {iframeRef: React.RefObject<HTMLIFrameElement | null>}) {
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Ready to test')
  const [connectionStatus, setConnectionStatus] = useState<string>('Not connected')
  const connectionRef = useRef<(() => void) | null>(null)

  // Stable status handler
  const handleStatus = useCallback((status: string) => {
    setConnectionStatus(status)
    console.log('[Dashboard] Connection status:', status)
  }, [])

  // Stable message handler
  const handleQueryRequest = useCallback(async (data: any) => {
    console.log('[Dashboard] Received query request:', data)
    
    try {
      // Create a subscription request from the incoming query data
      const subscription = createSubscriptionRequest({
        storeName: 'query',
        projectId: data.queryOptions.projectId,
        dataset: data.queryOptions.dataset,
        params: {
          query: data.queryOptions.query,
          options: data.queryOptions.params || {},
        },
        appId: 'dashboard-app',
      })

      console.log('[Dashboard] Creating subscription for query:', subscription)

      // Register the subscription with the SharedWorker (it will handle deduplication)
      const subscriptionId = await registerSubscription(subscription)
      console.log('[Dashboard] Subscription registered with ID:', subscriptionId)

      // Return the subscription ID and any initial data
      return {
        requestId: data.requestId,
        subscriptionId,
        data: {message: 'Query subscription created successfully'},
      }
    } catch (error) {
      console.error('[Dashboard] Error handling query request:', error)
      return {
        requestId: data.requestId,
        error: error instanceof Error ? error.message : String(error),
        subscriptionId: null,
      }
    }
  }, [])

  const {connect} = useFrameConnection<
    QueryResponseMessage,
    QueryRequestMessage
  >({
    name: 'dashboard',
    connectTo: 'sdk-app',
    targetOrigin: '*',
    onStatus: handleStatus,
    heartbeat: false, // Disable heartbeat to reduce cycling
    onMessage: {
      'dashboard/v1/query/request': handleQueryRequest,
    },
  })

  useEffect(() => {
    const handleIframeLoad = () => {
      // Clean up any existing connection
      if (connectionRef.current) {
        connectionRef.current()
        connectionRef.current = null
      }

      // Wait for iframe to be fully loaded
      setTimeout(() => {
        if (iframeRef.current?.contentWindow) {
          try {
            const cleanup = connect(iframeRef.current.contentWindow)
            connectionRef.current = cleanup
            console.log('[Dashboard] Connected to SDK app iframe')
          } catch (error) {
            console.error('[Dashboard] Failed to connect to iframe:', error)
          }
        }
      }, 100)
    }

    const iframe = iframeRef.current
    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad)
      
      // If iframe is already loaded, connect immediately
      if (iframe.contentDocument?.readyState === 'complete') {
        handleIframeLoad()
      }

      return () => {
        if (connectionRef.current) {
          connectionRef.current()
          connectionRef.current = null
        }
        iframe.removeEventListener('load', handleIframeLoad)
      }
    }
  }, [connect])

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
        <div>Comlink Connection Status: {connectionStatus}</div>
        <div style={{marginTop: 8}}>SharedWorker Test:</div>
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
  const iframeRef = useRef<HTMLIFrameElement>(null)

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
              height: '100vh',
              width: '100vw',
            }}
          >
            <SharedWorkerTest iframeRef={iframeRef} />
            <iframe
              ref={iframeRef}
              title="sdk-app"
              src="http://localhost:3341/"
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%',
                minHeight: '400px',
                backgroundColor: '#f5f5f5', // Add background to see if iframe is loading
              }}
              onLoad={() => {
                console.log('[Dashboard] Iframe loaded successfully')
              }}
              onError={(e) => {
                console.error('[Dashboard] Iframe failed to load:', e)
              }}
            />
          </div>
        </Suspense>
      </SanityApp>
    </ThemeProvider>
  )
}
