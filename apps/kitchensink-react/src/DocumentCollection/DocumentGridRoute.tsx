import {DocumentGridLayout, DocumentPreviewLayout} from '@sanity/sdk-react/components'
import {useDocuments} from '@sanity/sdk-react/hooks'

export function DocumentGridRoute(): JSX.Element {
  const result = useDocuments({
    filter: '_type == "author"',
    sort: [{field: 'name', direction: 'asc'}],
  })

  return (
    <div>
      <h1>Document Grid</h1>
      <DocumentGridLayout>
        {result.result?.map((doc) => (
          <li key="doc._id">
            <DocumentPreviewLayout
              title={doc._id}
              subtitle={doc._type}
              docType={doc._type}
              // hard coded to published for now
              status="published"
            />
          </li>
        ))}
      </DocumentGridLayout>
    </div>
  )
}
