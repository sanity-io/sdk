import {useDocumentProjection, useQuery} from '@sanity/sdk-react'
import {Card, Spinner, Text} from '@sanity/ui'
import {type JSX, Suspense, useState} from 'react'
import {SanityDocument} from 'sanity'

// Component to display projection data for a specific asset
function AssetProjection({assetId}: {assetId: string}) {
  const {data: projectionData} = useDocumentProjection<{
    title?: string
    arbitraryValues?: Record<string, string>
  }>({
    documentId: assetId,
    documentType: 'sanity.asset',
    sourceName: 'media-library',
    projection: '{title, arbitraryValues}',
  })

  return (
    <Card padding={3} style={{backgroundColor: '#1a1a1a'}}>
      <div style={{display: 'flex', alignItems: 'center', marginBottom: '1rem'}}>
        <Text size={1} weight="medium" style={{color: '#fff'}}>
          Projection Results:
        </Text>
      </div>

      <pre
        data-testid="projection-results"
        style={{
          backgroundColor: '#2a2a2a',
          padding: '1rem',
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '400px',
          fontSize: '0.875rem',
          color: '#fff',
          whiteSpace: 'pre-wrap',
        }}
      >
        {JSON.stringify(projectionData, null, 2)}
      </pre>
    </Card>
  )
}

export function MediaLibraryRoute(): JSX.Element {
  const [query] = useState('*[_type == "sanity.asset"][0...10] | order(_id desc)')
  const [isLoading] = useState(false)

  const {data, isPending} = useQuery<SanityDocument[]>({
    query,
    sourceName: 'media-library',
  })

  // Get the first asset's ID for projection testing
  const firstAssetId =
    data && Array.isArray(data) && data.length > 0 && data[0]?._id ? data[0]._id : null

  return (
    <div style={{padding: '2rem', maxWidth: '1200px', margin: '0 auto'}}>
      <Text size={4} weight="bold" style={{marginBottom: '2rem', color: 'white'}}>
        Media Library Demo
      </Text>

      <Text size={2} style={{marginBottom: '2rem'}}>
        This route demonstrates querying and projections against a Sanity media library. The query
        runs against:{' '}
        <code>https://api.sanity.io/v2025-03-24/media-libraries/mlPGY7BEqt52/query</code>
      </Text>

      <Card padding={3} style={{marginBottom: '2rem', backgroundColor: '#1a1a1a'}}>
        <div style={{marginBottom: '1rem'}}>
          <Text size={1} style={{color: '#ccc', marginBottom: '0.5rem'}}>
            Current query:
          </Text>
          <code
            style={{
              display: 'block',
              padding: '0.5rem',
              backgroundColor: '#2a2a2a',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: '#fff',
              wordBreak: 'break-all',
            }}
          >
            {query}
          </code>
        </div>
      </Card>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
        <Card padding={3} style={{backgroundColor: '#1a1a1a'}}>
          <div style={{display: 'flex', alignItems: 'center', marginBottom: '1rem'}}>
            <Text size={1} weight="medium" style={{color: '#fff'}}>
              useQuery Results:
            </Text>
            {(isPending || isLoading) && <Spinner style={{marginLeft: '0.5rem'}} />}
          </div>

          <pre
            data-testid="query-results"
            style={{
              backgroundColor: '#2a2a2a',
              padding: '1rem',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '400px',
              fontSize: '0.875rem',
              color: '#fff',
              whiteSpace: 'pre-wrap',
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </Card>

        {firstAssetId && (
          <Suspense
            fallback={
              <Card padding={3} style={{backgroundColor: '#1a1a1a'}}>
                <Spinner />
              </Card>
            }
          >
            <AssetProjection assetId={firstAssetId} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
