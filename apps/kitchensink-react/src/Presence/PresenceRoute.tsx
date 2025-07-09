import {usePresence} from '@sanity/sdk-react'
import {JSX, useEffect} from 'react'

export function PresenceRoute(): JSX.Element {
  const {locations, reportPresence} = usePresence()

  useEffect(() => {
    const interval = setInterval(() => {
      reportPresence([
        {
          type: 'document',
          documentId: 'presence-test',
          path: [],
          lastActiveAt: new Date().toISOString(),
        },
      ])
    }, 1000)
    return () => clearInterval(interval)
  }, [reportPresence])

  return (
    <div>
      <h1>Presence</h1>
      <pre>{JSON.stringify(locations, null, 2)}</pre>
    </div>
  )
}
