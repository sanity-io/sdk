import {useDocuments} from '@sanity/sdk-react'
import {type JSX} from 'react'

import {DocumentListLayout} from '../components/DocumentListLayout/DocumentListLayout'
import {LoadMore} from '../components/LoadMore'
import {PageLayout} from '../components/PageLayout'
import {DocumentPreview} from './DocumentPreview'

export function DocumentListRoute(): JSX.Element {
  const {isPending, data, hasMore, loadMore} = useDocuments({
    documentType: 'author',
    orderings: [{field: '_updatedAt', direction: 'desc'}],
  })

  return (
    <PageLayout title="Document list" subtitle="Authors, newest first">
      <DocumentListLayout>
        {data.map((docHandle) => (
          <DocumentPreview key={docHandle.documentId} {...docHandle} />
        ))}
        <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
      </DocumentListLayout>
    </PageLayout>
  )
}
