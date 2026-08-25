import {
  DatasetResource,
  type DocumentHandle,
  useDocument,
  useDocumentPreview,
  useDocumentProjection,
  useDocuments,
  useEditDocument,
  useResource,
} from '@sanity/sdk-react'
import {Badge, Box, Button, Flex, Stack, Text, TextInput} from '@sanity/ui'
import {defineProjection} from 'groq'
import {type JSX, type ReactNode, type RefObject, Suspense, useRef} from 'react'
import {useSearchParams} from 'react-router'

import {
  type MultiResourceAuthorProjectionProjectionResult,
  MultiResourceMovieProjectionProjectionResult,
} from '../../sanity.types'
import {Card} from 'ui5'

import {PageLayout} from '../components/PageLayout'
import {devResources, e2eResources, isE2E} from '../sanityConfigs'

function LoadingFallback({message = 'Loading...'}: {message?: string}) {
  return (
    <Card density="regular" style={{flex: 1, minWidth: 280}}>
      <Text muted size={1}>
        {message}
      </Text>
    </Card>
  )
}

interface DemoCardProps {
  title: string
  projectInfo: string
  children: ReactNode
  forwardedRef?: RefObject<HTMLDivElement | null>
}

const multiResourceAuthorProjection = defineProjection(`{
  name,
  role,
  "awardCount": count(awards),
  "firstAward": awards[0]
}`)

const multiResourceMovieProjection = defineProjection(`{
  title,
  release_date,
  "hasPoster": defined(hosted_poster_path)
  }`)

interface ProjectionCardProps<TData = unknown> {
  docHandle: DocumentHandle
  projection: string
  title: string
  renderData: (data: TData | undefined, isPending: boolean) => ReactNode
}

function ProjectionCard<TData = unknown>({
  docHandle,
  projection,
  title,
  renderData,
}: ProjectionCardProps<TData>) {
  const ref = useRef<HTMLDivElement>(null)
  const {data, isPending} = useDocumentProjection({
    ...docHandle,
    ref,
    projection: projection,
  })

  return (
    <DemoCard
      title={title}
      projectInfo={`${docHandle.projectId}.${docHandle.dataset}`}
      forwardedRef={ref}
    >
      <Stack gap={2}>
        {isPending && (
          <Text muted size={1}>
            Loading projection data...
          </Text>
        )}
        {renderData(data as TData | undefined, isPending)}
      </Stack>
    </DemoCard>
  )
}

interface PreviewCardProps {
  docHandle: DocumentHandle
  title: string
}

function PreviewCard({docHandle, title}: PreviewCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const {data: preview, isPending} = useDocumentPreview({
    ...docHandle,
    ref,
  })

  return (
    <DemoCard
      title={title}
      projectInfo={`${docHandle.projectId}.${docHandle.dataset}`}
      forwardedRef={ref}
    >
      <Stack gap={2}>
        {isPending && (
          <Text muted size={1}>
            Loading preview data...
          </Text>
        )}
        <Text muted={isPending} size={1}>
          Title: {preview?.title ?? 'No title'}
        </Text>
        <Text muted={isPending} size={1}>
          Subtitle: {preview?.subtitle ?? 'No subtitle'}
        </Text>
        <Text muted={isPending} size={1}>
          Media Type: {preview?.media?.type ?? 'No media'}
        </Text>
        {preview?.media?.type === 'image-asset' && preview.media.url && (
          <Box>
            <img
              src={preview.media.url}
              alt="Preview"
              style={{maxWidth: 100, height: 'auto', borderRadius: 4}}
            />
          </Box>
        )}
      </Stack>
    </DemoCard>
  )
}

function DemoCard({title, projectInfo, children, forwardedRef}: DemoCardProps) {
  const testId = title.toLowerCase().replace(/\s+/g, '-')
  return (
    <Card
      ref={forwardedRef}
      data-testid={`${testId}-${projectInfo.replace('.', '-')}`}
      density="regular"
      style={{flex: 1, minWidth: 280}}
    >
      <Stack gap={3}>
        <Flex align="center" gap={2} justify="space-between" wrap="wrap">
          <Text size={1} weight="semibold">
            {title} ({projectInfo})
          </Text>
          <Badge fontSize={1}>{projectInfo}</Badge>
        </Flex>
        {children}
      </Stack>
    </Card>
  )
}

function AuthorEditor({docHandle}: {docHandle: DocumentHandle<'author'>}) {
  const {data: author} = useDocument(docHandle)
  const setAuthorName = useEditDocument({...docHandle, path: 'name'})

  return (
    <DemoCard
      title="Author Document"
      projectInfo={`${docHandle.projectId}.${docHandle.dataset}`}
    >
      <Button
        as="a"
        fontSize={1}
        href={`https://test-studio.sanity.build/${docHandle.dataset}/structure/author;${author?._id}`}
        mode="bleed"
        padding={2}
        rel="noopener noreferrer"
        target="_blank"
        text="View in Studio"
      />
      <Text data-testid="author-name-display" size={1} weight="semibold">
        {author?.name}
      </Text>
      <TextInput
        data-testid="author-name-input"
        fontSize={1}
        label="Name"
        type="text"
        value={author?.name}
        onChange={(e) => setAuthorName(e.currentTarget.value)}
      />
      {author?.role && <Text size={1}>Role: {author.role}</Text>}
      {author?.awards && author.awards.length > 0 && (
        <Stack gap={2}>
          <Text size={1} weight="semibold">
            Awards
          </Text>
          <Stack as="ul" gap={1} paddingLeft={4}>
            {author.awards.map((award: string, index: number) => (
              <Text as="li" key={index} size={1}>
                {award}
              </Text>
            ))}
          </Stack>
        </Stack>
      )}
    </DemoCard>
  )
}

function MovieEditor({docHandle}: {docHandle: DocumentHandle<'movie'>}) {
  const {data: movie} = useDocument(docHandle)
  const setMovieName = useEditDocument({...docHandle, path: 'title'})

  return (
    <DemoCard
      title="Movie Document"
      projectInfo={`${docHandle.projectId}.${docHandle.dataset}`}
    >
      <Button
        as="a"
        fontSize={1}
        href={`https://sdk-movie-procure-studio.sanity.studio/structure/movie;${movie?._id}`}
        mode="bleed"
        padding={2}
        rel="noopener noreferrer"
        target="_blank"
        text="View in Studio"
      />
      <Text data-testid="movie-name-display" size={1} weight="semibold">
        {movie?.title}
      </Text>
      <TextInput
        data-testid="movie-name-input"
        fontSize={1}
        label="Name"
        type="text"
        value={movie?.title}
        onChange={(e) => setMovieName(e.currentTarget.value)}
      />
      <Text size={1}>TMDB ID: {movie?.tmdb_id}</Text>
    </DemoCard>
  )
}

function AuthorProjection({docHandle}: {docHandle: DocumentHandle<'author'>}) {
  return (
    <ProjectionCard<MultiResourceAuthorProjectionProjectionResult>
      docHandle={docHandle}
      projection={multiResourceAuthorProjection}
      title="Author Projection"
      renderData={(data, isPending) => (
        <Stack data-testid="author-projection-data" gap={2}>
          <Text data-testid="author-projection-name" muted={isPending} size={1}>
            Name: {data?.name ?? 'No name'}
          </Text>
          <Text data-testid="author-projection-role" muted={isPending} size={1}>
            Role: {data?.role ?? 'No role'}
          </Text>
          <Text data-testid="author-projection-award-count" muted={isPending} size={1}>
            Award Count: {data?.awardCount ?? 0}
          </Text>
          {data?.firstAward && (
            <Text data-testid="author-projection-first-award" muted={isPending} size={1}>
              First Award: {data.firstAward}
            </Text>
          )}
        </Stack>
      )}
    />
  )
}

function MovieProjection({docHandle}: {docHandle: DocumentHandle<'movie'>}) {
  return (
    <ProjectionCard<MultiResourceMovieProjectionProjectionResult>
      docHandle={docHandle}
      projection={multiResourceMovieProjection}
      title="Movie Projection"
      renderData={(data, isPending) => (
        <Stack data-testid="movie-projection-data" gap={2}>
          <Text data-testid="movie-projection-name" muted={isPending} size={1}>
            Title: {data?.title ?? 'No title'}
          </Text>
          <Text data-testid="movie-projection-release-date" muted={isPending} size={1}>
            Release Date: {data?.release_date ?? 'Not set'}
          </Text>
          <Text data-testid="movie-projection-has-poster" muted={isPending} size={1}>
            Has Poster: {data?.hasPoster ? 'Yes' : 'No'}
          </Text>
        </Stack>
      )}
    />
  )
}

function AuthorPreview({docHandle}: {docHandle: DocumentHandle<'author'>}) {
  return <PreviewCard docHandle={docHandle} title="Author Preview" />
}

function MoviePreview({docHandle}: {docHandle: DocumentHandle<'movie'>}) {
  return <PreviewCard docHandle={docHandle} title="Movie Preview" />
}

export function MultiResourceRoute(): JSX.Element {
  const [searchParams] = useSearchParams()
  const authorIdParam = searchParams.get('authorId')
  const movieIdParam = searchParams.get('movieId')
  const defaultResource = useResource()

  const {data: authorDocuments} = useDocuments({
    documentType: 'author',
    batchSize: 1,
    ...(authorIdParam ? {filter: '_id == $authorId', params: {authorId: authorIdParam}} : {}),
  })

  const {data: movieDocuments} = useDocuments({
    documentType: 'movie',
    batchSize: 1,
    resourceName: 'secondary',
    ...(movieIdParam ? {filter: '_id == $movieId', params: {movieId: movieIdParam}} : {}),
  })

  const authorHandle = authorDocuments[0] ?? null
  const movieHandle = movieDocuments[0] ?? null

  if (!authorDocuments.length || !movieDocuments.length) {
    return (
      <PageLayout title="Multi-resource" subtitle="Documents from two projects on one page">
        <Text size={1}>No documents found in one or both datasets</Text>
      </PageLayout>
    )
  }

  if (!authorHandle || !movieHandle) {
    return (
      <PageLayout title="Multi-resource" subtitle="Documents from two projects on one page">
        <Text muted size={1}>
          Loading...
        </Text>
      </PageLayout>
    )
  }

  // remove when we add the ability to use `useResource` with a `resourceName` param
  const secondaryResource = isE2E ? e2eResources['secondary'] : devResources['secondary']

  return (
    <PageLayout title="Multi-resource" subtitle="Documents from two projects on one page">
      <Stack gap={5}>
        <Text size={1} muted>
          This route demonstrates how to use multiple resources in a single page. You must have
          access to both resources ({(defaultResource as DatasetResource).projectId}.
          {(defaultResource as DatasetResource).dataset} and{' '}
          {(secondaryResource as DatasetResource).projectId}.
          {(secondaryResource as DatasetResource).dataset}) to see the documents.
        </Text>

        <Stack gap={3}>
          <Text size={1} weight="semibold">
            Document Editors
          </Text>
          <Flex gap={4} wrap="wrap">
            <AuthorEditor docHandle={authorHandle} />
            <MovieEditor docHandle={movieHandle} />
          </Flex>
        </Stack>

        <Stack gap={3}>
          <Text size={1} weight="semibold">
            Document Projections
          </Text>
          <Flex gap={4} wrap="wrap">
            <Suspense fallback={<LoadingFallback message="Loading author projection..." />}>
              <AuthorProjection docHandle={authorHandle} />
            </Suspense>
            <Suspense fallback={<LoadingFallback message="Loading movie projection..." />}>
              <MovieProjection docHandle={movieHandle} />
            </Suspense>
          </Flex>
        </Stack>

        <Stack gap={3}>
          <Text size={1} weight="semibold">
            Document Previews
          </Text>
          <Flex gap={4} wrap="wrap">
            <Suspense fallback={<LoadingFallback message="Loading author preview..." />}>
              <AuthorPreview docHandle={authorHandle} />
            </Suspense>
            <Suspense fallback={<LoadingFallback message="Loading movie preview..." />}>
              <MoviePreview docHandle={movieHandle} />
            </Suspense>
          </Flex>
        </Stack>
      </Stack>
    </PageLayout>
  )
}
