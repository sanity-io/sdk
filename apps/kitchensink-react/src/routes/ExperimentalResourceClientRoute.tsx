import {useClient} from '@sanity/sdk-react'
import {Button} from '@sanity/ui'
import {Author} from 'apps/kitchensink-react/sanity.types'
import {type JSX, useState} from 'react'

export default function ExperimentalResourceClientRoute(): JSX.Element {
  const projectId = 'ppsg7ml5'
  const documentId = 'db06bc9e-4608-465a-9551-a10cef478037'
  const dataset = 'test'
  const client = useClient({
    'projectId': projectId,
    'dataset': dataset,
    'apiVersion': 'vX',
    '~experimental_resource': {type: 'dataset', id: `${projectId}.${dataset}`},
  })

  //api.sanity.io/vX/projects/ppsg7ml5/datasets/test/doc/db06bc9e-4608-465a-9551-a10cef478037?tag=sanity.sdk

  async function fetchDocument() {
    try {
      const doc = await client.getDocument(documentId)
      setDocument(doc as Author)
    } catch (error) {
      setError(error)
      setDocument(null)
    }
  }
  // client.fetch(`releases::all()[state == 'active']`).then((doc) => {
  //   console.log(doc)
  // })

  const [document, setDocument] = useState<Author | null>(null)
  const [error, setError] = useState<Error | null>(null)
  return (
    <div>
      <h2 style={{color: 'white', marginBottom: '2rem', fontWeight: 'bold'}}>
        ExperimentalResourceClientRoute
      </h2>
      <p style={{color: 'white', marginBottom: '2rem'}}>
        This route demonstrates how to use the experimental resource (global API) client. Check
        network tab for the request URL.
      </p>
      <div style={{marginBottom: '2rem'}}>
        <Button onClick={() => fetchDocument()}>Fetch Document</Button>
      </div>
      {error && <p style={{color: 'red', marginBottom: '2rem'}}>{error.message}</p>}
      {document && (
        <div style={{color: 'white', marginBottom: '2rem'}}>
          <p>{document.name}</p>
          <p>{document.role}</p>
          <p>{document.awards?.map((award) => award).join(', ')}</p>
        </div>
      )}
    </div>
  )
}
