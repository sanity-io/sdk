import {PerspectiveHandle, useActiveReleases, useDocuments, usePerspective} from '@sanity/sdk-react'
import {type JSX, useState} from 'react'

import {DocumentPreview} from '../DocumentCollection/DocumentPreview'

function DocumentList(perspectiveHandle: PerspectiveHandle) {
  const perspective = usePerspective(perspectiveHandle)
  const {data} = useDocuments({
    ...perspectiveHandle,
    filter: '_type==$type',
    params: {type: 'author'},
    orderings: [{field: '_updatedAt', direction: 'desc'}],
    batchSize: 5,
  })

  return (
    <div>
      <p>Documents in perspective: {JSON.stringify(perspective)}</p>
      <ul>
        {data.map((i) => (
          <DocumentPreview key={i.documentId} {...i} />
        ))}
      </ul>
    </div>
  )
}

export function ReleasesRoute(): JSX.Element {
  const [selectedRelease, setSelectedRelease] = useState('')

  // TODO: types should be fixed to assert that these don't return null (they suspend)
  const activeReleases = useActiveReleases()!
  const calculatedPerspective = usePerspective({
    perspective: selectedRelease ? {releaseName: selectedRelease} : undefined,
  })!
  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRelease(event.target.value)
  }

  return (
    <div>
      <h1>Releases Test Page</h1>
      <pre>{JSON.stringify(activeReleases, null, 2)}</pre>

      {activeReleases && activeReleases.length > 0 && (
        <div>
          <label htmlFor="release-select">Select a release:</label>
          <select id="release-select" value={selectedRelease} onChange={handleSelectChange}>
            <option value="">Select a release</option>
            {activeReleases.map((release) => (
              <option key={release.name} value={release.name}>
                {release.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* TODO: Add release testing components here */}
      {selectedRelease && <p>Selected Release: {selectedRelease}</p>}
      <div>
        <h2>Calculated Perspective</h2>
        <pre>{JSON.stringify(calculatedPerspective, null, 2)}</pre>
      </div>

      <DocumentList perspective={selectedRelease ? {releaseName: selectedRelease} : undefined} />
    </div>
  )
}
