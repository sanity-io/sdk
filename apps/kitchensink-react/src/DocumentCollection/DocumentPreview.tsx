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

  let mediaUrl
  if (media) {
    const url = new URL(media.url)
    url.searchParams.set('h', '33')
    url.searchParams.set('w', '33')
    url.searchParams.set('fit', 'crop')
    mediaUrl = url.toString()
  } else {
    mediaUrl = null
  }

  return (
    <DocumentPreviewLayout
      ref={ref}
      title={title}
      subtitle={subtitle}
      docType={document._type}
      media={mediaUrl && <img src={mediaUrl} />}
      status={document._id.startsWith('drafts.') ? 'draft' : 'published'}
    />
  )
}
