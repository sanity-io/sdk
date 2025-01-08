import {DocumentHandle} from '@sanity/sdk'
import {DocumentPreviewLayout} from '@sanity/sdk-react/components'
import {usePreview} from '@sanity/sdk-react/hooks'
import {Suspense, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

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
  const [ref, setRef] = useState<HTMLElement | null>(null)
  const [{title, subtitle, media, status}] = usePreview({document, ref})

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
      ref={setRef}
      title={title}
      subtitle={subtitle}
      docType={document._type}
      media={media}
      status={statusLabel}
      onClick={() => alert(`Hello from ${title}`)}
    />
  )
}
