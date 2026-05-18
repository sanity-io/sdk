import {type JSX} from 'react'

import {ResourceDemoRoute} from '../components/ResourceDemoRoute'

export function MediaLibraryRoute(): JSX.Element {
  return (
    <ResourceDemoRoute
      title="Media Library Demo"
      description={
        <>
          This route demonstrates querying and projections against a Sanity media library. The query
          runs against:{' '}
          <code>https://api.sanity.io/v2025-03-24/media-libraries/mlPGY7BEqt52/query</code>
        </>
      }
      resourceName="media-library"
      documentType="sanity.asset"
      initialQuery='*[_type == "sanity.asset"][0...10] | order(_id desc)'
      projection="{title, arbitraryValues}"
      itemNoun="Asset"
      editor={{nameField: 'title', nameLabel: 'Title'}}
    />
  )
}
