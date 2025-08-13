import {SanityApp, SanityConfig, useQuery, useWindowConnection} from '@sanity/sdk-react'
import {Spinner, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type JSX} from 'react'

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

// Test component to demonstrate query forwarding
function QueryTest() {
  // hack -- something in the node setup in the query store has a race condition
  useWindowConnection<QueryResponseMessage, QueryRequestMessage>({
    name: 'sdk-app',
    connectTo: 'dashboard',
  })

  // This query should be forwarded to Dashboard when in iframe context
  const {data, isPending} = useQuery({
    query: '*[_type == "movie"][0...5]{_id, title, releaseYear}',
    projectId: 'ppsg7ml5',
    dataset: 'test',
  })

  console.log('data', data)

  return (
    <div style={{padding: 16}}>
      <h2>SDK App - Query Test</h2>
      <div style={{marginTop: 8}}>
        {/* <strong>Query Status:</strong> {isPending ? 'Loading...' : 'Loaded'} */}
      </div>
      <div style={{marginTop: 8}}>
        <strong>Data:</strong>
        <pre
          style={{
            marginTop: 4,
            padding: 8,
            backgroundColor: '#f5f5f5',
            borderRadius: 4,
            fontSize: '12px',
          }}
        >
          {/* {JSON.stringify(data, null, 2)} */}
        </pre>
      </div>
      <div style={{marginTop: 8, fontSize: '12px', color: '#666'}}>
        Check the browser console to see the query forwarding logs!
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <SanityApp fallback={<Spinner />} config={devConfigs}>
        <div style={{height: '100vh', width: '100vw', overflow: 'auto'}}>
          <QueryTest />
        </div>
      </SanityApp>
    </ThemeProvider>
  )
}
