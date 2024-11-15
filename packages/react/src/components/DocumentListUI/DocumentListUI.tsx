import {Grid, Stack} from '@sanity/ui'

import type {DocumentPreviewProps} from '../DocumentPreviewUI/DocumentPreviewUI.tsx'
import DocumentPreviewUI from '../DocumentPreviewUI/DocumentPreviewUI.tsx'

export interface DocumentListProps {
  documents: Array<DocumentPreviewProps>
  layout?: 'list' | 'grid'
}

export default function DocumentListUI({
  documents = [],
  layout = 'list',
}: DocumentListProps): JSX.Element {
  const El = layout === 'grid' ? Grid : Stack

  const stackProps = {
    space: 0,
  }

  const gridProps = {
    columns: 6, // Todo: implement custom grid with fluid columns
  }

  const elProps = layout === 'grid' ? gridProps : stackProps

  // Todo: empty state
  if (documents.length < 1) return <></>

  return (
    <El as="ol" data-ui="DocumentList" {...elProps}>
      {documents.map((doc) => (
        <li>
          <DocumentPreviewUI
            title={doc.title}
            subtitle={doc.subtitle}
            media={doc.media}
            docType={doc.docType}
            status={doc.status}
            url={doc.url}
          />
        </li>
      ))}
    </El>
  )
}

DocumentListUI.displayName = 'DocumentList'
