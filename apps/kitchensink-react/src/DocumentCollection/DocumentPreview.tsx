import {DocumentHandle} from '@sanity/sdk'
import {DocumentPreviewLayout} from '@sanity/sdk-react/components'
import {usePreview} from '@sanity/sdk-react/hooks'
import {Suspense, useRef} from 'react'

export interface DocumentPreviewProps {
  document: DocumentHandle
}

export function DocumentPreview(props: DocumentPreviewProps): React.ReactNode {
  return (
    <li>
      <Suspense fallback={<DocumentPreviewLayout title="Loading" />}>
        <DocumentPreviewResolved {...props} />
      </Suspense>
    </li>
  )
}

function DocumentPreviewResolved({document}: DocumentPreviewProps): React.ReactNode {
  const ref = useRef<HTMLElement>(null)
  const [{title, subtitle, media}] = usePreview({document, ref})

  return (
    <DocumentPreviewLayout
      ref={ref}
      title={title}
      subtitle={subtitle}
      docType={document._type}
      media={media}
      status={document._id.startsWith('drafts.') ? 'draft' : 'published'}
    />
  )
}
