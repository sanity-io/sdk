import {
  type DocumentPresence,
  useDocumentProjection,
  useDocuments,
  usePresenceForDocument,
  useReportPresence,
  useResource,
} from '@sanity/sdk-react'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Inline,
  Select,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {Code} from '@sanity/ui/code'
import {JSX, useState} from 'react'
import {useSearchParams} from 'react-router'

import {Card} from 'ui5'

import {PageLayout} from '../components/PageLayout'

const DOCUMENT_TYPE = 'author'

/**
 * The Studio that serves the kitchensink's default resource, `ppsg7ml5` / `test`.
 * Override with `?studio=<baseUrl>` when pointing at any other one.
 */
const DEFAULT_STUDIO_BASE_URL = 'https://test-studio.sanity.build/test'

/**
 * The fields that report field-level presence when focused.
 *
 * Both exist on the `author` schema in the Studio, which matters: presence is
 * reported against a path whether or not a field is in the schema, but a Studio
 * with no input for that path has nowhere to draw the indicator. Picking real
 * fields is what makes the Studio interop check work in both directions.
 */
const FIELDS = [
  {name: 'name', label: 'Name'},
  // Mirrors the schema, where `role` is a list of these three values.
  {name: 'role', label: 'Role', options: ['developer', 'designer', 'ops']},
] as const

/** The perspectives this route can be present in. Mirrors what the Studio offers. */
type Perspective = 'drafts' | 'published'

/** Who else is focused at or below one field. */
function FieldPresence({
  documentId,
  perspective,
  path,
  testId,
}: {
  documentId: string
  perspective: Perspective
  path: string[]
  testId: string
}): JSX.Element {
  // `excludeVersions` deliberately: a field indicator should show only people in
  // the same document you are looking at, not someone in a release version of it.
  const {presence} = usePresenceForDocument({
    documentId,
    documentType: DOCUMENT_TYPE,
    perspective,
    path,
    excludeVersions: true,
  })

  return (
    <Inline gap={2} data-testid={`presence-field-${testId}`} data-count={presence.length}>
      {presence.map((participant) => (
        <Badge
          key={participant.sessionId}
          tone="primary"
          data-testid={`presence-field-${testId}-avatar`}
        >
          {participant.user.profile.displayName}
        </Badge>
      ))}
    </Inline>
  )
}

/**
 * Announces the current user, and nothing else.
 *
 * Split out so announcing can be switched off by not rendering it, rather than by
 * conditionally calling a hook. Unmounting clears the reported location, which is
 * what `useReportPresence` does on cleanup.
 */
function PresenceReporter({
  documentId,
  perspective,
  focusedField,
}: {
  documentId: string
  perspective: Perspective
  focusedField?: string
}): null {
  useReportPresence({
    documentId,
    documentType: DOCUMENT_TYPE,
    perspective,
    ...(focusedField ? {path: [focusedField]} : {}),
  })
  return null
}

function PerspectiveSelect({
  perspective,
  onChange,
}: {
  perspective: Perspective
  onChange: (next: Perspective) => void
}): JSX.Element {
  return (
    <Flex align="center" gap={2}>
      <Text size={1} muted>
        Perspective
      </Text>
      <Select
        data-testid="presence-perspective"
        value={perspective}
        onChange={(event) =>
          onChange(event.currentTarget.value === 'published' ? 'published' : 'drafts')
        }
      >
        <option value="drafts">drafts</option>
        <option value="published">published</option>
      </Select>
    </Flex>
  )
}

/** The project and dataset in play, so a mismatch with the Studio link is visible. */
function ScopeText(): JSX.Element | null {
  const resource = useResource()
  if (!resource || !('projectId' in resource)) return null

  return (
    <Text size={1} muted>
      {`Project ${resource.projectId} · dataset ${resource.dataset}`}
    </Text>
  )
}

function DocumentCard({
  documentId,
  perspective,
  onPerspectiveChange,
  studioUrl,
}: {
  documentId: string
  perspective: Perspective
  onPerspectiveChange: (next: Perspective) => void
  studioUrl: string
}): JSX.Element {
  const {data} = useDocumentProjection<{name: string | null}>({
    documentId,
    documentType: DOCUMENT_TYPE,
    projection: `{name}`,
  })

  return (
    <Card density="regular">
      <Flex align="flex-start" gap={3}>
        <Stack gap={3} flex={1}>
          <Text size={1} weight="medium">
            {data?.name ?? 'Untitled'}
          </Text>
          <Code size={0} data-testid="presence-document-id">
            {documentId}
          </Code>
          <PerspectiveSelect perspective={perspective} onChange={onPerspectiveChange} />
          <ScopeText />
        </Stack>
        <Button
          as="a"
          href={studioUrl}
          target="_blank"
          rel="noreferrer"
          mode="ghost"
          text="Open in Studio"
          data-testid="presence-studio-link"
        />
      </Flex>
    </Card>
  )
}

function AnnounceToggle({
  announcing,
  onChange,
}: {
  announcing: boolean
  onChange: (next: boolean) => void
}): JSX.Element {
  return (
    <Card density="regular">
      <Flex align="flex-start" gap={3}>
        <Checkbox
          id="presence-announcing"
          data-testid="presence-announcing"
          checked={announcing}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <Stack gap={2} flex={1}>
          <Text
            as="label"
            htmlFor="presence-announcing"
            size={1}
            weight="medium"
            data-testid="presence-announcing-label"
          >
            Announce my presence
          </Text>
          <Text size={1} muted>
            Turn this off to read presence without appearing to anyone else, which is how an app
            that only displays presence behaves.
          </Text>
        </Stack>
      </Flex>
    </Card>
  )
}

function Participant({participant}: {participant: DocumentPresence}): JSX.Element {
  return (
    <Flex align="center" gap={2} data-testid="presence-document-participant">
      <Badge tone="primary">{participant.user.profile.displayName}</Badge>
      <Code size={0} data-testid="presence-participant-document-id">
        {participant.documentId}
      </Code>
      {/* Plain text rather than `Code`, which renders as a block and would stack
          the words vertically. */}
      <Text size={1} muted>
        {participant.path.length > 0 ? `in ${participant.path.join('.')}` : 'at the document root'}
      </Text>
    </Flex>
  )
}

function ParticipantList({
  documentId,
  perspective,
}: {
  documentId: string
  perspective: Perspective
}): JSX.Element {
  const {presence} = usePresenceForDocument({documentId, documentType: DOCUMENT_TYPE, perspective})

  return (
    <Stack gap={3}>
      <Text size={1} weight="semibold">
        Others in this document
      </Text>
      <Card data-count={presence.length} data-testid="presence-document" density="regular">
        {presence.length === 0 ? (
          <Text size={1} muted data-testid="presence-document-empty">
            Nobody else is here
          </Text>
        ) : (
          <Stack gap={3}>
            {presence.map((participant) => (
              <Participant key={participant.sessionId} participant={participant} />
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  )
}

function FieldRow({
  field,
  documentId,
  perspective,
  onFocus,
  onBlur,
}: {
  field: (typeof FIELDS)[number]
  documentId: string
  perspective: Perspective
  onFocus: () => void
  onBlur: () => void
}): JSX.Element {
  const testId = `presence-input-${field.name}`

  return (
    <Stack gap={2}>
      <Flex align="center" gap={2}>
        <Text size={1} weight="medium">
          {field.label}
        </Text>
        <FieldPresence
          documentId={documentId}
          perspective={perspective}
          path={[field.name]}
          testId={field.name}
        />
      </Flex>
      {'options' in field ? (
        <Select data-testid={testId} onFocus={onFocus} onBlur={onBlur}>
          <option value="">Focus to be present in {field.name}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : (
        <TextInput
          data-testid={testId}
          placeholder={`Focus to be present in ${field.name}`}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      )}
    </Stack>
  )
}

function Notes(): JSX.Element {
  return (
    <Stack gap={2}>
      <Text size={1} muted>
        Opening the same document in a Studio checks that presence works between the two: they share
        one room per project and dataset, so each should see the other. The link assumes that Studio
        serves the project and dataset above.
      </Text>
      <Text size={1} muted>
        The perspective is the only thing an app supplies; the hooks resolve it to the specific
        document being edited. That matters because the Studio compares published ids in its navbar
        and document lists but compares the exact id its form is on for field indicators, so
        reporting the wrong one appears at document level yet never lights up a field.
      </Text>
      <Text size={1} muted>
        Defaults to the most recently created {DOCUMENT_TYPE} document. Add ?documentId=&lt;id&gt;
        to the URL to pick a different one, or ?studio=&lt;baseUrl&gt; to point the link at another
        Studio.
      </Text>
    </Stack>
  )
}

/**
 * Announces the current user and shows everyone else in the same document.
 *
 * Two browser tabs are what this route is built to demonstrate. Presence stores
 * are keyed by project and dataset and shared across `SanityInstance`s in one
 * JavaScript realm, so two panes on this page would be a single participant with a
 * single session. Separate tabs are separate realms, hence separate sessions.
 */
function PresenceDemo({documentId}: {documentId: string}): JSX.Element {
  const [searchParams] = useSearchParams()
  const [focusedField, setFocusedField] = useState<string | undefined>(undefined)
  const [announcing, setAnnouncing] = useState(true)

  // The perspective is all the app supplies. The SDK resolves it to the specific
  // document being edited, which is what other clients compare against: the draft
  // under `drafts`, the published document under `published`. Getting that wrong is
  // why presence can appear in the Studio at document level while never lighting up
  // a field.
  const [perspective, setPerspective] = useState<Perspective>('drafts')

  const studioBase = (searchParams.get('studio') ?? DEFAULT_STUDIO_BASE_URL).replace(/\/+$/, '')
  // An intent link rather than a structure path, so the Studio resolves it with
  // whichever tool handles editing rather than us guessing its structure.
  const studioUrl = `${studioBase}/intent/edit/id=${encodeURIComponent(documentId)};type=${DOCUMENT_TYPE}`

  return (
    <PageLayout
      title="Presence"
      subtitle="Open this page in a second tab to see presence. Both tabs are you, as two separate sessions, which is what the Studio shows too."
    >
      {announcing ? (
        <PresenceReporter
          documentId={documentId}
          perspective={perspective}
          focusedField={focusedField}
        />
      ) : null}

      <DocumentCard
        documentId={documentId}
        perspective={perspective}
        onPerspectiveChange={setPerspective}
        studioUrl={studioUrl}
      />
      <Notes />
      <AnnounceToggle announcing={announcing} onChange={setAnnouncing} />
      <ParticipantList documentId={documentId} perspective={perspective} />

      <Stack gap={3}>
        <Text size={1} weight="semibold">
          Fields
        </Text>
        <Text size={1} muted>
          Focus a field to report presence there. The other tab shows a badge beside it.
        </Text>
        {FIELDS.map((field) => (
          <FieldRow
            key={field.name}
            field={field}
            documentId={documentId}
            perspective={perspective}
            onFocus={() => setFocusedField(field.name)}
            onBlur={() => setFocusedField(undefined)}
          />
        ))}
        <Box>
          <Button
            data-testid="presence-blur"
            mode="ghost"
            text="Clear focus"
            onClick={() => setFocusedField(undefined)}
          />
        </Box>
      </Stack>
    </PageLayout>
  )
}

function NoDocuments({documentIdParam}: {documentIdParam: string | null}): JSX.Element {
  const detail = documentIdParam
    ? `No ${DOCUMENT_TYPE} document with id ${documentIdParam}.`
    : `No ${DOCUMENT_TYPE} documents in this dataset.`

  return (
    <PageLayout title="Presence" subtitle="Nothing to be present in">
      <Card density="regular" tone="caution">
        <Text size={1} data-testid="presence-no-documents">
          {detail}
        </Text>
      </Card>
    </PageLayout>
  )
}

export function PresenceRoute(): JSX.Element {
  const [searchParams] = useSearchParams()
  const documentIdParam = searchParams.get('documentId')

  // Defaults to a real document so the route is useful the moment you open it,
  // with no id to look up first. Ordered explicitly rather than relying on the
  // API's default, because every tab has to land on the same document for presence
  // to mean anything.
  const {data} = useDocuments({
    documentType: DOCUMENT_TYPE,
    batchSize: 1,
    orderings: [{field: '_createdAt', direction: 'desc'}],
    ...(documentIdParam
      ? {filter: '_id == $documentId', params: {documentId: documentIdParam}}
      : {}),
  })

  const documentId = data[0]?.documentId
  if (!documentId) return <NoDocuments documentIdParam={documentIdParam} />

  return <PresenceDemo documentId={documentId} />
}
