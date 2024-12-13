import {getImage} from '@sanity/asset-utils'
import {DocumentHandle} from '@sanity/sdk'
import {DocumentPreviewLayout} from '@sanity/sdk-react/components'
import {usePreview} from '@sanity/sdk-react/hooks'
import {Suspense, useRef} from 'react'

import {useImageUrlBuilder} from '../utils/imageUrlBuilder'

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
  const builder = useImageUrlBuilder()

  let mediaUrl = null
  if (media) {
    const url = builder.image(getImage(media)).width(200).height(200).fit('crop').url()
    mediaUrl = url.toString()
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
