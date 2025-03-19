import {DocumentHandle} from '@sanity/sdk'
import {usePreview} from '@sanity/sdk-react'
import {Suspense, useRef} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {DocumentPreviewLayout} from '../components/DocumentPreviewLayout/DocumentPreviewLayout'

interface DocumentPreviewProps {
  document: DocumentHandle
}

export function DocumentPreview(props: DocumentPreviewProps): React.ReactNode {
  return (
    <li>
      <ErrorBoundary
        fallback={<DocumentPreviewLayout title="Error" subtitle="This preview failed to render." />}
      >
        <Suspense fallback={<DocumentPreviewLayout title="Loading" />}>
          <DocumentPreviewResolved {...props} />
        </Suspense>
      </ErrorBoundary>
    </li>
  )
}

function DocumentPreviewResolved({document}: DocumentPreviewProps): React.ReactNode {
  const ref = useRef(null)
  const {
    data: {title, subtitle, media, status},
  } = usePreview({document, ref})

  let statusLabel
  if (status?.lastEditedPublishedAt && status?.lastEditedDraftAt) {
    const published = new Date(status.lastEditedPublishedAt)
    const draft = new Date(status.lastEditedDraftAt)

    if (published.getTime() > draft.getTime()) {
      statusLabel = 'published'
    } else {
      statusLabel = 'draft'
    }
  } else if (status?.lastEditedPublishedAt) {
    statusLabel = 'published'
  } else {
    statusLabel = 'draft'
  }

  return (
    <DocumentPreviewLayout
      ref={ref}
      title={title}
      subtitle={subtitle}
      docType={document._type}
      media={media}
      status={statusLabel}
      onClick={() => alert(`Hello from ${title}`)}
    />
  )
}
