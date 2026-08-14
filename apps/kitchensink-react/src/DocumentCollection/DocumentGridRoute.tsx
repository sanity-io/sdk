import {useDocuments} from '@sanity/sdk-react'
import {Button} from '@sanity/ui'
import {type JSX} from 'react'

import {DocumentGridLayout} from '../components/DocumentGridLayout/DocumentGridLayout'
import {PageLayout} from '../components/PageLayout'
import {DocumentPreview} from './DocumentPreview'

export function DocumentGridRoute(): JSX.Element {
  const {isPending, data, hasMore, loadMore} = useDocuments({
    documentType: 'author',
    orderings: [{field: 'name', direction: 'asc'}],
  })

  return (
    <PageLayout title="Document grid" subtitle="Authors, A to Z">
      <DocumentGridLayout>
        {data.map((doc) => (
          <DocumentPreview key={doc.documentId} {...doc} />
        ))}
      </DocumentGridLayout>
      <Button
        text="Load more"
        mode="ghost"
        fontSize={1}
        disabled={isPending || !hasMore}
        onClick={loadMore}
      />
    </PageLayout>
  )
}
