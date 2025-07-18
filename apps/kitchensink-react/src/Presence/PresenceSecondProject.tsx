import {usePresence, useProject} from '@sanity/sdk-react'
import {JSX} from 'react'

export function PresenceSecondProject(): JSX.Element {
  const project = useProject()
  const {locations} = usePresence()

  return (
    <div>
      <p>Project: {project?.id}</p>
      <pre>{JSON.stringify(locations, null, 2)}</pre>
    </div>
  )
}
