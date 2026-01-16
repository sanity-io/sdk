import {SanityDocument, useDispatchIntent, useQuery} from '@sanity/sdk-react'
import {Button, Card, Spinner, Text} from '@sanity/ui'
import {type JSX, Suspense} from 'react'

const PROJECT_ID = 'ppsg7ml5'
const DATASET = 'test'
const MOVIE_PROJECT_ID = 'vo1ysemo'
const MOVIE_DATASET = 'production'

function DatasetDocumentIntent({document}: {document: SanityDocument}): JSX.Element {
  const {dispatchIntent} = useDispatchIntent({
    action: 'edit',
    documentHandle: {
      documentId: document._id,
      documentType: document._type,
      projectId: PROJECT_ID,
      dataset: DATASET,
    },
  })

  return (
    <Button
      text={`Dispatch Intent for Dataset Document (${PROJECT_ID})`}
      tone="primary"
      onClick={() => dispatchIntent()}
    />
  )
}

function MovieDocumentIntent({document}: {document: SanityDocument}): JSX.Element {
  const {dispatchIntent} = useDispatchIntent({
    action: 'edit',
    documentHandle: {
      documentId: document._id,
      documentType: document._type,
      projectId: MOVIE_PROJECT_ID,
      dataset: MOVIE_DATASET,
    },
  })

  return (
    <Button
      text={`Dispatch Intent for Movie (${MOVIE_PROJECT_ID})`}
      tone="primary"
      onClick={() => dispatchIntent()}
    />
  )
}

function MediaLibraryAssetIntent({asset}: {asset: {_id: string; _type: string}}): JSX.Element {
  const {dispatchIntent} = useDispatchIntent({
    action: 'edit',
    documentHandle: {
      documentId: asset._id,
      documentType: asset._type,
      sourceName: 'media-library',
    },
  })

  return (
    <Button
      text="Dispatch Intent for Media Library Asset"
      tone="primary"
      onClick={() => dispatchIntent()}
    />
  )
}

function CanvasDocumentIntent({document}: {document: SanityDocument}): JSX.Element {
  const {dispatchIntent} = useDispatchIntent({
    action: 'edit',
    documentHandle: {
      documentId: document._id,
      documentType: document._type,
      sourceName: 'canvas',
    },
  })
  return (
    <Button
      text="Dispatch Intent for Canvas Document"
      tone="primary"
      onClick={() => dispatchIntent()}
    />
  )
}

function IntentsContent(): JSX.Element {
  // Fetch first document from project/dataset
  const {data: firstDocument, isPending: isDocumentPending} = useQuery<SanityDocument>({
    query: '*[_type == "book"][0]',
    projectId: PROJECT_ID,
    dataset: DATASET,
  })

  // Fetch first movie from vo1ysemo/production
  const {data: firstMovie, isPending: isMoviePending} = useQuery<SanityDocument>({
    query: '*[_type == "movie"][0]',
    projectId: MOVIE_PROJECT_ID,
    dataset: MOVIE_DATASET,
  })

  // Fetch first asset from media library
  const {data: firstAsset, isPending: isAssetPending} = useQuery<SanityDocument>({
    query: '*[_type == "sanity.asset"][0]',
    sourceName: 'media-library',
  })

  // Fetch first canvas document from Sanity Sandbox Org Canvas
  const {data: firstCanvasDocument, isPending: isCanvasDocumentPending} = useQuery<SanityDocument>({
    query: '*[_type == "sanity.canvas.document"][0]',
    sourceName: 'canvas',
  })

  const isLoading = isDocumentPending || isMoviePending || isAssetPending || isCanvasDocumentPending

  return (
    <div style={{padding: '2rem', maxWidth: '800px', margin: '0 auto'}}>
      <Text size={4} weight="bold" style={{marginBottom: '2rem', color: 'white'}}>
        Intent Dispatch Demo
      </Text>

      <Text size={2} style={{marginBottom: '2rem'}}>
        This route demonstrates dispatching intents for documents from both a traditional dataset
        and a media library source.
      </Text>

      {isLoading && (
        <Card padding={3} style={{marginBottom: '2rem', backgroundColor: '#1a1a1a'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <Spinner />
            <Text>Loading documents...</Text>
          </div>
        </Card>
      )}

      <Card padding={3} style={{marginBottom: '2rem', backgroundColor: '#1a1a1a'}}>
        <Text size={2} weight="bold" style={{marginBottom: '1rem', color: 'white'}}>
          Dataset Document Intent
        </Text>
        <Text size={1} style={{marginBottom: '1rem', color: '#ccc'}}>
          Project: {PROJECT_ID} | Dataset: {DATASET}
        </Text>
        <div>
          <Text size={1} style={{marginBottom: '0.5rem', color: '#ccc'}}>
            Document ID: <code>{firstDocument?._id}</code>
          </Text>
          <Text size={1} style={{marginBottom: '1rem', color: '#ccc'}}>
            Document Type: <code>{firstDocument?._type}</code>
          </Text>
          <DatasetDocumentIntent document={firstDocument} />
        </div>
      </Card>

      <Card padding={3} style={{marginBottom: '2rem', backgroundColor: '#1a1a1a'}}>
        <Text size={2} weight="bold" style={{marginBottom: '1rem', color: 'white'}}>
          Movie Document Intent
        </Text>
        <Text size={1} style={{marginBottom: '1rem', color: '#ccc'}}>
          Project: {MOVIE_PROJECT_ID} | Dataset: {MOVIE_DATASET}
        </Text>
        <div>
          <Text size={1} style={{marginBottom: '0.5rem', color: '#ccc'}}>
            Document ID: <code>{firstMovie?._id}</code>
          </Text>
          <Text size={1} style={{marginBottom: '1rem', color: '#ccc'}}>
            Document Type: <code>{firstMovie?._type}</code>
          </Text>
          <MovieDocumentIntent document={firstMovie} />
        </div>
      </Card>

      <Card padding={3} style={{marginBottom: '2rem', backgroundColor: '#1a1a1a'}}>
        <Text size={2} weight="bold" style={{marginBottom: '1rem', color: 'white'}}>
          Media Library Asset Intent
        </Text>
        <Text size={1} style={{marginBottom: '1rem', color: '#ccc'}}>
          Source Name: media-library
        </Text>
        <MediaLibraryAssetIntent asset={firstAsset} />
      </Card>

      <Card padding={3} style={{marginBottom: '2rem', backgroundColor: '#1a1a1a'}}>
        <Text size={2} weight="bold" style={{marginBottom: '1rem', color: 'white'}}>
          Canvas Document Intent
        </Text>
        <Text size={1} style={{marginBottom: '1rem', color: '#ccc'}}>
          Source Name: canvas
        </Text>
        <div>
          <Text size={1} style={{marginBottom: '0.5rem', color: '#ccc'}}>
            Document ID: <code>{firstCanvasDocument?._id}</code>
          </Text>
          <Text size={1} style={{marginBottom: '1rem', color: '#ccc'}}>
            Document Type: <code>{firstCanvasDocument?._type}</code>
          </Text>
          <CanvasDocumentIntent document={firstCanvasDocument} />
        </div>
      </Card>
    </div>
  )
}

export function IntentsRoute(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div style={{padding: '2rem', maxWidth: '800px', margin: '0 auto'}}>
          <Card padding={3} style={{backgroundColor: '#1a1a1a'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <Spinner />
              <Text>Loading...</Text>
            </div>
          </Card>
        </div>
      }
    >
      <IntentsContent />
    </Suspense>
  )
}
