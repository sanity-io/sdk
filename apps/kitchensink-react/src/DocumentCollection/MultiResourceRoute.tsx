import {
  type DocumentHandle,
  useDocument,
  useDocumentPreview,
  useDocumentProjection,
  useDocuments,
  useEditDocument,
} from '@sanity/sdk-react'
import {Box, TextInput} from '@sanity/ui'
import {defineProjection} from 'groq'
import {JSX, Suspense, useRef} from 'react'

import {
  type MultiResourceAuthorProjectionProjectionResult,
  type MultiResourcePlayerProjectionProjectionResult,
} from '../../sanity.types'
import {devConfigs, e2eConfigs} from '../sanityConfigs'

function LoadingFallback({message = 'Loading...'}: {message?: string}) {
  return (
    <div style={{padding: '1rem', opacity: 0.6, fontStyle: 'italic', fontSize: '0.9rem'}}>
      {message}
    </div>
  )
}

interface DemoCardProps {
  title: string
  projectInfo: string
  backgroundColor: string
  borderColor: string
  textColor?: string
  children: React.ReactNode
  forwardedRef?: React.RefObject<HTMLDivElement | null>
}

const multiResourceAuthorProjection = defineProjection(`{
  name,
  role,
  "awardCount": count(awards),
  "firstAward": awards[0]
}`)

const multiResourcePlayerProjection = defineProjection(`{
  name,
  slackUserId,
  "hasSlackId": defined(slackUserId)
  }`)

interface ProjectionCardProps<TData = unknown> {
  docHandle: DocumentHandle
  projection: string
  title: string
  backgroundColor: string
  borderColor: string
  textColor?: string
  renderData: (data: TData | undefined, isPending: boolean) => React.ReactNode
}

function ProjectionCard<TData = unknown>({
  docHandle,
  projection,
  title,
  backgroundColor,
  borderColor,
  textColor,
  renderData,
}: ProjectionCardProps<TData>) {
  const ref = useRef<HTMLDivElement>(null)
  const {data, isPending} = useDocumentProjection({
    ...docHandle,
    ref,
    projection: projection as `{${string}}`,
  })

  return (
    <DemoCard
      title={title}
      projectInfo={`${docHandle.projectId}.${docHandle.dataset}`}
      backgroundColor={backgroundColor}
      borderColor={borderColor}
      textColor={textColor}
      forwardedRef={ref}
    >
      <div style={{fontSize: '0.9rem', lineHeight: '1.6'}}>
        {isPending && <p style={{opacity: 0.6, fontStyle: 'italic'}}>Loading projection data...</p>}
        {renderData(data as TData | undefined, isPending)}
      </div>
    </DemoCard>
  )
}

interface PreviewCardProps {
  docHandle: DocumentHandle
  title: string
  backgroundColor: string
  borderColor: string
  textColor?: string
}

function PreviewCard({
  docHandle,
  title,
  backgroundColor,
  borderColor,
  textColor,
}: PreviewCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const {data: preview, isPending} = useDocumentPreview({
    ...docHandle,
    ref,
  })

  return (
    <DemoCard
      title={title}
      projectInfo={`${docHandle.projectId}.${docHandle.dataset}`}
      backgroundColor={backgroundColor}
      borderColor={borderColor}
      textColor={textColor}
      forwardedRef={ref}
    >
      <div style={{fontSize: '0.9rem', lineHeight: '1.6'}}>
        {isPending && <p style={{opacity: 0.6, fontStyle: 'italic'}}>Loading preview data...</p>}
        <p style={{opacity: isPending ? 0.5 : 1}}>
          <strong>Title:</strong> {preview?.title ?? 'No title'}
        </p>
        <p style={{opacity: isPending ? 0.5 : 1}}>
          <strong>Subtitle:</strong> {preview?.subtitle ?? 'No subtitle'}
        </p>
        <p style={{opacity: isPending ? 0.5 : 1}}>
          <strong>Media Type:</strong> {preview?.media?.type ?? 'No media'}
        </p>
        {preview?.media?.type === 'image-asset' && preview.media.url && (
          <div style={{marginTop: '0.5rem', opacity: isPending ? 0.5 : 1}}>
            <img
              src={preview.media.url}
              alt="Preview"
              style={{maxWidth: '100px', height: 'auto', borderRadius: '4px'}}
            />
          </div>
        )}
      </div>
    </DemoCard>
  )
}

function DemoCard({
  title,
  projectInfo,
  backgroundColor,
  borderColor,
  textColor = '#fff',
  children,
  forwardedRef,
}: DemoCardProps) {
  const testId = title.toLowerCase().replace(/\s+/g, '-')
  return (
    <div
      ref={forwardedRef}
      data-testid={`${testId}-${projectInfo.replace('.', '-')}`}
      style={{
        padding: '1.5rem',
        borderRadius: '8px',
        backgroundColor,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        minWidth: '280px',
        flex: 1,
        color: textColor,
        border: `2px solid ${borderColor}`,
      }}
    >
      <h3 style={{marginBottom: '1rem', color: textColor === '#fff' ? '#e0b3ff' : '#2a2a2a'}}>
        {title} ({projectInfo})
      </h3>
      {children}
    </div>
  )
}

function AuthorEditor({docHandle}: {docHandle: DocumentHandle<'author'>}) {
  const {data: author} = useDocument(docHandle)
  const setAuthorName = useEditDocument({...docHandle, path: 'name'})

  return (
    <DemoCard
      title="Author Document"
      projectInfo={`${docHandle.projectId}.${docHandle.dataset}`}
      backgroundColor="#3f0067"
      borderColor="#3f0067"
    >
      <a
        style={{display: 'block', marginBottom: '1rem', color: '#3e41e7'}}
        href={`https://test-studio.sanity.build/${docHandle.dataset}/structure/author;${author?._id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        View in Studio →
      </a>
      <h4 data-testid="author-name-display" style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>
        {author?.name}
      </h4>
      <TextInput
        data-testid="author-name-input"
        label="Name"
        type="text"
        value={author?.name}
        onChange={(e) => setAuthorName(e.currentTarget.value)}
      />
      {author?.role && <p style={{color: '#fff', marginBottom: '1rem'}}>Role: {author.role}</p>}
      {author?.awards && author.awards.length > 0 && (
        <div>
          <h5 style={{marginBottom: '0.5rem'}}>Awards</h5>
          <ul style={{paddingLeft: '1.5rem'}}>
            {author.awards.map((award: string, index: number) => (
              <li key={index}>{award}</li>
            ))}
          </ul>
        </div>
      )}
    </DemoCard>
  )
}

function PlayerEditor({docHandle}: {docHandle: DocumentHandle<'player'>}) {
  const {data: player} = useDocument(docHandle)
  const setPlayerName = useEditDocument({...docHandle, path: 'name'})

  return (
    <DemoCard
      title="Player Document"
      projectInfo={`${docHandle.projectId}.${docHandle.dataset}`}
      backgroundColor="#b4e6ef"
      borderColor="#4fb3c0"
      textColor="#444"
    >
      <a
        style={{display: 'block', marginBottom: '1rem', color: '#3e41e7'}}
        href={`https://autofoos.com/structure/player;${player?._id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        View in Studio →
      </a>
      <h4 data-testid="player-name-display" style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>
        {player?.name}
      </h4>
      <TextInput
        data-testid="player-name-input"
        label="Name"
        type="text"
        value={player?.name}
        onChange={(e) => setPlayerName(e.currentTarget.value)}
      />
      <div style={{color: '#444', marginBottom: '1rem'}}>
        {player?.slackUserId && `Slack User ID: ${player.slackUserId}`}
      </div>
    </DemoCard>
  )
}

function AuthorProjection({docHandle}: {docHandle: DocumentHandle<'author'>}) {
  return (
    <ProjectionCard<MultiResourceAuthorProjectionProjectionResult>
      docHandle={docHandle}
      projection={multiResourceAuthorProjection}
      title="Author Projection"
      backgroundColor="#1a0033"
      borderColor="#3f0067"
      renderData={(data, isPending) => (
        <div data-testid="author-projection-data">
          <p data-testid="author-projection-name" style={{opacity: isPending ? 0.5 : 1}}>
            <strong>Name:</strong> {data?.name ?? 'No name'}
          </p>
          <p data-testid="author-projection-role" style={{opacity: isPending ? 0.5 : 1}}>
            <strong>Role:</strong> {data?.role ?? 'No role'}
          </p>
          <p data-testid="author-projection-award-count" style={{opacity: isPending ? 0.5 : 1}}>
            <strong>Award Count:</strong> {data?.awardCount ?? 0}
          </p>
          {data?.firstAward && (
            <p data-testid="author-projection-first-award" style={{opacity: isPending ? 0.5 : 1}}>
              <strong>First Award:</strong> {data.firstAward}
            </p>
          )}
        </div>
      )}
    />
  )
}

function PlayerProjection({docHandle}: {docHandle: DocumentHandle<'player'>}) {
  return (
    <ProjectionCard<MultiResourcePlayerProjectionProjectionResult>
      docHandle={docHandle}
      projection={multiResourcePlayerProjection}
      title="Player Projection"
      backgroundColor="#7fc7d1"
      borderColor="#4fb3c0"
      textColor="#1a1a1a"
      renderData={(data, isPending) => (
        <div data-testid="player-projection-data">
          <p data-testid="player-projection-name" style={{opacity: isPending ? 0.5 : 1}}>
            <strong>Name:</strong> {data?.name ?? 'No name'}
          </p>
          <p data-testid="player-projection-slack-id" style={{opacity: isPending ? 0.5 : 1}}>
            <strong>Slack User ID:</strong> {data?.slackUserId ?? 'Not set'}
          </p>
          <p data-testid="player-projection-has-slack" style={{opacity: isPending ? 0.5 : 1}}>
            <strong>Has Slack ID:</strong> {data?.hasSlackId ? 'Yes' : 'No'}
          </p>
        </div>
      )}
    />
  )
}

function AuthorPreview({docHandle}: {docHandle: DocumentHandle<'author'>}) {
  return (
    <PreviewCard
      docHandle={docHandle}
      title="Author Preview"
      backgroundColor="#4d1a75"
      borderColor="#6b2d96"
    />
  )
}

function PlayerPreview({docHandle}: {docHandle: DocumentHandle<'player'>}) {
  return (
    <PreviewCard
      docHandle={docHandle}
      title="Player Preview"
      backgroundColor="#5ca8b5"
      borderColor="#4a929e"
      textColor="#1a1a1a"
    />
  )
}

export function MultiResourceRoute(): JSX.Element {
  const configs = import.meta.env['VITE_IS_E2E'] ? e2eConfigs : devConfigs
  const {data: authorDocuments} = useDocuments({
    documentType: 'author',
    batchSize: 1,
    projectId: configs[0].projectId,
    dataset: configs[0].dataset,
  })

  const {data: playerDocuments} = useDocuments({
    documentType: 'player',
    batchSize: 1,
    projectId: configs[1].projectId,
    dataset: configs[1].dataset,
  })

  const authorHandle = authorDocuments[0] ?? null
  const playerHandle = playerDocuments[0] ?? null

  if (!authorDocuments.length || !playerDocuments.length) {
    return <Box padding={4}>No documents found in one or both datasets</Box>
  }

  if (!authorHandle || !playerHandle) {
    return <Box padding={4}>Loading...</Box>
  }

  return (
    <div>
      <p style={{marginBottom: '2rem'}}>
        This route demonstrates how to use multiple resources in a single page.
        <br />
        Note you must have access to both resources ({configs[0].projectId}.{configs[0].dataset} and{' '}
        {configs[1].projectId}.{configs[1].dataset}) to see the documents.
      </p>

      <h2 style={{marginBottom: '1rem'}}>Document Editors</h2>
      <div style={{display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '3rem'}}>
        <AuthorEditor docHandle={authorHandle} />
        <PlayerEditor docHandle={playerHandle} />
      </div>

      <h2 style={{marginBottom: '1rem'}}>Document Projections</h2>
      <div style={{display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '3rem'}}>
        <Suspense fallback={<LoadingFallback message="Loading author projection..." />}>
          <AuthorProjection docHandle={authorHandle} />
        </Suspense>
        <Suspense fallback={<LoadingFallback message="Loading player projection..." />}>
          <PlayerProjection docHandle={playerHandle} />
        </Suspense>
      </div>

      <h2 style={{marginBottom: '1rem'}}>Document Previews</h2>
      <div style={{display: 'flex', gap: '2rem', flexWrap: 'wrap'}}>
        <Suspense fallback={<LoadingFallback message="Loading author preview..." />}>
          <AuthorPreview docHandle={authorHandle} />
        </Suspense>
        <Suspense fallback={<LoadingFallback message="Loading player preview..." />}>
          <PlayerPreview docHandle={playerHandle} />
        </Suspense>
      </div>
    </div>
  )
}
