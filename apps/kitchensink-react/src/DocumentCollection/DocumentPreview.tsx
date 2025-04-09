import {DocumentHandle, usePreview} from '@sanity/sdk-react'
import {Suspense, useRef} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {DocumentPreviewLayout} from '../components/DocumentPreviewLayout/DocumentPreviewLayout'

export function DocumentPreview(docHandle: DocumentHandle): React.ReactNode {
  return (
    <li>
      <ErrorBoundary
        fallback={<DocumentPreviewLayout title="Error" subtitle="This preview failed to render." />}
      >
        <Suspense fallback={<DocumentPreviewLayout title="Loading" />}>
          <DocumentPreviewResolved {...docHandle} />
        </Suspense>
      </ErrorBoundary>
    </li>
  )
}

function DocumentPreviewResolved(docHandle: DocumentHandle): React.ReactNode {
  const ref = useRef(null)
  const {
    data: {title, subtitle, media, status},
  } = usePreview({...docHandle, ref})

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
      docType={docHandle.documentType}
      media={media}
      status={statusLabel}
      onClick={() => alert(`Hello from ${title}`)}
    />
  )
}
