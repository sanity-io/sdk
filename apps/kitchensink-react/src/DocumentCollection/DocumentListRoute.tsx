import {DocumentListLayout, DocumentPreviewLayout} from '@sanity/sdk-react/components'
import {useDocuments} from '@sanity/sdk-react/hooks'

export function DocumentListRoute(): JSX.Element {
  const result = useDocuments({
    filter: '_type == "author"',
    sort: [{field: 'name', direction: 'asc'}],
  })

  return (
    <div>
      <h1>Document List</h1>
      <DocumentListLayout>
        {result.result?.map((doc) => (
          <li key={doc._id}>
            <DocumentPreviewLayout
              title={doc._id}
              subtitle={doc._type}
              docType={doc._type}
              // hard coded to published for now
              status="published"
            />
          </li>
        ))}
      </DocumentListLayout>
    </div>
  )
}
