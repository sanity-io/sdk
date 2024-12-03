import {Stack} from '@sanity/ui'
import type {ReactElement} from 'react'
import styled from 'styled-components'

import type {DocumentPreviewProps} from '../DocumentPreviewUI/DocumentPreviewUI.tsx'
import DocumentPreviewUI from '../DocumentPreviewUI/DocumentPreviewUI.tsx'

/**
 * @public
 */
export interface DocumentListItemProps extends DocumentPreviewProps {
  id: string
}

/**
 * @public
 */
export interface PreviewOptions {
  showDocumentType?: boolean
  showDocumentStatus?: boolean
}

/**
 * @public
 */
export interface DocumentListProps {
  documents: Array<DocumentListItemProps>
  layout?: 'list' | 'grid'
  previewOptions?: PreviewOptions
}

const DocumentGrid = styled.div`
  display: grid;
  list-style: none;
  margin: unset;
  padding: unset;
  grid-template-columns: repeat(auto-fit, minmax(38ch, 1fr));
`

/**
 * This is a component that renders a list of documents.
 * @public
 * @param {DocumentListProps} props - The props for the DocumentListUI component.
 * @param {Array<DocumentPreviewProps>} props.documents - The documents to render.
 * @param {string} props.layout - The layout to use for the document list.
 * @returns {JSX.Element} - The DocumentListUI component.
 */
export const DocumentListUI = ({
  documents = [],
  layout = 'list',
  previewOptions = {},
}: DocumentListProps): ReactElement => {
  const El = layout === 'grid' ? DocumentGrid : Stack

  const stackProps = {
    space: 0,
  }

  const elProps = layout === 'grid' ? null : stackProps

  // Todo: empty state
  if (documents.length < 1) return <></>

  return (
    <El
      as="ol"
      data-ui={layout === 'grid' ? 'DocumentList:Grid' : 'DocumentList:List'}
      {...elProps}
    >
      {documents.map((doc) => {
        const docPreviewProps: {docType?: string; status?: string} = {}

        if (previewOptions?.showDocumentType) docPreviewProps.docType = doc.docType
        if (previewOptions?.showDocumentStatus) docPreviewProps.status = doc.status

        return (
          <li key={doc.id}>
            <DocumentPreviewUI
              {...docPreviewProps}
              title={doc.title}
              subtitle={doc.subtitle}
              media={doc.media}
              selected={doc.selected}
              url={doc.url}
            />
          </li>
        )
      })}
    </El>
  )
}

DocumentListUI.displayName = 'DocumentList'
