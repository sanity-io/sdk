import {DocumentHandle, useDocumentPreview} from '@sanity/sdk-react'
import {Suspense, useRef} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {DocumentPreviewLayout} from '../components/DocumentPreviewLayout/DocumentPreviewLayout'

type DocumentPreviewProps = DocumentHandle & {
  onClick?: () => void
}

export function DocumentPreview(documentPreviewProps: DocumentPreviewProps): React.ReactNode {
  return (
    <li>
      <ErrorBoundary
        fallback={<DocumentPreviewLayout title="Error" subtitle="This preview failed to render." />}
      >
        <Suspense fallback={<DocumentPreviewLayout title="Loading" />}>
          <DocumentPreviewResolved {...documentPreviewProps} />
        </Suspense>
      </ErrorBoundary>
    </li>
  )
}

function DocumentPreviewResolved({onClick, ...docHandle}: DocumentPreviewProps): React.ReactNode {
  const ref = useRef(null)
  const {
    data: {title, subtitle, media, _status},
  } = useDocumentPreview({...docHandle, ref})

  let statusLabel
  if (_status?.lastEditedPublishedAt && _status?.lastEditedDraftAt) {
    const published = new Date(_status.lastEditedPublishedAt)
    const draft = new Date(_status.lastEditedDraftAt)

    if (published.getTime() > draft.getTime()) {
      statusLabel = 'published'
    } else {
      statusLabel = 'draft'
    }
  } else if (_status?.lastEditedPublishedAt) {
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
      documentId={docHandle.documentId}
      onClick={() => (onClick ? onClick() : alert(`Hello from ${title}`))}
    />
  )
}
