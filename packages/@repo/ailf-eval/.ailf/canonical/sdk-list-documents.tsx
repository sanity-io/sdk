/**
 * Gold-standard reference solution for the `sdk-list-documents` task.
 *
 * Lists "post" documents with the App SDK's useDocuments hook, renders each
 * title via useDocumentProjection inside a Suspense boundary, and paginates
 * with a "Load more" button. The grader uses this as a correctness reference.
 */
import {type DocumentHandle, useDocumentProjection, useDocuments} from '@sanity/sdk-react'
import {type ReactElement, Suspense} from 'react'

function PostTitle({post}: {post: DocumentHandle}) {
  const {data} = useDocumentProjection<{title?: string}>({
    ...post,
    projection: '{title}',
  })

  return <>{data?.title || 'Untitled'}</>
}

export default function PostList(): ReactElement {
  const {data, hasMore, isPending, loadMore} = useDocuments({
    documentType: 'post',
    orderings: [{field: '_createdAt', direction: 'desc'}],
  })

  return (
    <div>
      <ol>
        {data.map((post) => (
          <li key={post.documentId}>
            <Suspense fallback="Loading…">
              <PostTitle post={post} />
            </Suspense>
          </li>
        ))}
      </ol>
      {hasMore && (
        <button type="button" onClick={loadMore} disabled={isPending}>
          {isPending ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
