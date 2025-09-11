import {useQuery} from '@sanity/sdk-react'
import {Card, Spinner, Text} from '@sanity/ui'
import {type JSX, useState} from 'react'

export default function MediaLibraryRoute(): JSX.Element {
  const [query] = useState('*[_type == "sanity.asset"][0...10] | order(_id desc)')
  const [isLoading] = useState(false)

  // for now, hardcoded. should be inferred from org later on
  const {data, isPending} = useQuery({
    mediaLibraryId: 'mlPGY7BEqt52',
    query,
  })

  return (
    <div style={{padding: '2rem', maxWidth: '800px', margin: '0 auto'}}>
      <Text size={4} weight="bold" style={{marginBottom: '2rem', color: 'white'}}>
        Media Library Query Demo
      </Text>

      <Text size={2} style={{marginBottom: '2rem'}}>
        This route demonstrates querying against a Sanity media library. The MediaLibraryProvider is
        automatically created by SanityApp when a media library config is present. The query runs
        against: <code>https://api.sanity.io/v2025-03-24/media-libraries/mlPGY7BEqt52/query</code>
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

      <Card padding={3} style={{backgroundColor: '#1a1a1a'}}>
        <div style={{display: 'flex', alignItems: 'center', marginBottom: '1rem'}}>
          <Text size={1} weight="medium" style={{color: '#fff'}}>
            Query Results:
          </Text>
          {(isPending || isLoading) && <Spinner style={{marginLeft: '0.5rem'}} />}
        </div>

        <pre
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
    </div>
  )
}
