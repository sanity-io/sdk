import {type JSX} from 'react'

import {ResourceDemoRoute} from '../components/ResourceDemoRoute'

export function CanvasRoute(): JSX.Element {
  return (
    <ResourceDemoRoute
      title="Canvas Demo"
      description={
        <>
          This route demonstrates querying and projections against a Sanity canvas. The query runs
          against: <code>https://api.sanity.io/v2025-03-24/canvases/cag5gSK37IGV/query</code>
        </>
      }
      resourceName="canvas"
      documentType="sanity.canvas.document"
      initialQuery='*[_type == "sanity.canvas.document"][0...10] | order(_id desc)'
      projection="{title}"
      itemNoun="Document"
      editor={{nameField: 'title', nameLabel: 'Title'}}
    />
  )
}
