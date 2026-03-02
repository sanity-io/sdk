import {usePresence, useProject} from '@sanity/sdk-react'
import {JSX} from 'react'

import {PresenceSecondProject} from './PresenceSecondProject'

export function PresenceRoute(): JSX.Element {
  const project = useProject()
  const {locations} = usePresence()

  return (
    <div>
      <h1>Presence for {project?.id}</h1>
      <p>
        <a href={`https://test-studio.sanity.build/test/structure/`} target={project?.id}>
          View in Studio →
        </a>
      </p>
      <pre>{JSON.stringify(locations, null, 2)}</pre>
      <h1>Second Project Presence</h1>
      <PresenceSecondProject />
    </div>
  )
}
