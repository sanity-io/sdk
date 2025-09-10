import {ResourceProvider, usePresence, useProject} from '@sanity/sdk-react'
import {JSX} from 'react'

import {devConfigs} from '../sanityConfigs'
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
      <h1>Second Project Presence for {devConfigs[1].projectId}</h1>
      <p>
        <a
          href={`https://sdk-movie-procure-studio.sanity.studio/${devConfigs[1].dataset}/structure/`}
          target={devConfigs[1].dataset}
        >
          View in Studio →
        </a>
      </p>
      <ResourceProvider
        projectId={devConfigs[1].projectId}
        dataset={devConfigs[1].dataset}
        fallback={<p>Loading...</p>}
      >
        <PresenceSecondProject />
      </ResourceProvider>
    </div>
  )
}
