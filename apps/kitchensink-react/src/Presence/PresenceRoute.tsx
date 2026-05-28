import {usePresence, useProject} from '@sanity/sdk-react'
import {JSX} from 'react'

function PresenceSecondProject(): JSX.Element {
  const project = useProject({projectId: 'vo1ysemo'})
  const {locations} = usePresence({resource: {projectId: 'vo1ysemo', dataset: 'production'}})

  return (
    <div>
      <p>Project: {project?.id}</p>
      <pre>{JSON.stringify(locations, null, 2)}</pre>
    </div>
  )
}

function PresenceCanvas(): JSX.Element {
  const canvasId = 'cag5gSK37IGV'
  const {locations} = usePresence({resource: {canvasId}})

  return (
    <div>
      <p>Canvas: {canvasId}</p>
      <pre>{JSON.stringify(locations, null, 2)}</pre>
    </div>
  )
}

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
      <h1>Canvas Presence</h1>
      <PresenceCanvas />
    </div>
  )
}
