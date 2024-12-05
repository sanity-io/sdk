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
export interface DocumentListProps {
  documents: Array<DocumentListItemProps>
  layout?: 'list' | 'grid'
}

// Todo: use styled(Grid)?
// https://sanity-io.slack.com/archives/C015Z0LLXM1/p1731955338958259
const DocumentGrid = styled.div`
  display: grid;
  list-style: none;
  margin: unset;
  padding: unset;
  grid-template-columns: repeat(auto-fit, minmax(max(20%, 280px), 1fr));
`

/**
 * This is a component that renders a list of documents.
 * @public
 * @param props - The props for the DocumentListUI component.
 * @returns - The DocumentListUI component.
 */
export const DocumentListUI = ({
  documents = [],
  layout = 'list',
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
      {documents.map((doc) => (
        <li key={doc.id}>
          <DocumentPreviewUI
            title={doc.title}
            subtitle={doc.subtitle}
            media={doc.media}
            docType={doc.docType}
            selected={doc.selected}
            status={doc.status}
            url={doc.url}
          />
        </li>
      ))}
    </El>
  )
}

DocumentListUI.displayName = 'DocumentList'
