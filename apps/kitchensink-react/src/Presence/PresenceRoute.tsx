import {
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
  Card,
  Checkbox,
  Code,
  Flex,
  Inline,
  Select,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {JSX, useState} from 'react'
import {useSearchParams} from 'react-router'

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

/**
 * Who else is focused at or below one field.
 *
 * `excludeVersions` is on deliberately: a field indicator should show only people
 * in the same document you are looking at, not someone in a release version of it.
 */
function FieldPresence({
  documentId,
  path,
  testId,
}: {
  documentId: string
  path: string[]
  testId: string
}): JSX.Element {
  const {presence} = usePresenceForDocument({
    documentId,
    documentType: DOCUMENT_TYPE,
    path,
    excludeVersions: true,
  })

  return (
    <Inline space={2} data-testid={`presence-field-${testId}`} data-count={presence.length}>
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
  focusedField,
}: {
  documentId: string
  focusedField?: string
}): null {
  useReportPresence({
    documentId,
    documentType: DOCUMENT_TYPE,
    ...(focusedField ? {path: [focusedField]} : {}),
  })
  return null
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

  // Which exact document id to be present in, and it matters more than it looks.
  //
  // The Studio scopes presence differently per surface. Its navbar and document
  // lists compare published ids, so they match whichever of these you pick. Its
  // form field indicators use the id it is actually editing with an exact
  // comparison, and while editing in the default perspective that is the draft.
  // So reporting the published id shows up in the Studio at document level while
  // never lighting up a single field.
  //
  // Defaults to the draft for that reason. `drafts.` is the stable convention for
  // draft ids; the SDK does not re-export an id helper for this.
  const [reportAs, setReportAs] = useState<'draft' | 'published'>('draft')
  const reportedId = reportAs === 'draft' ? `drafts.${documentId}` : documentId

  const resource = useResource()
  const studioBaseUrl = (searchParams.get('studio') ?? DEFAULT_STUDIO_BASE_URL).replace(/\/+$/, '')
  // An intent link rather than a structure path, so the Studio resolves it with
  // whichever tool handles editing rather than us guessing its structure.
  const studioUrl = `${studioBaseUrl}/intent/edit/id=${encodeURIComponent(documentId)};type=${DOCUMENT_TYPE}`

  const {presence} = usePresenceForDocument({documentId: reportedId, documentType: DOCUMENT_TYPE})
  const {data} = useDocumentProjection<{name: string | null}>({
    documentId,
    documentType: DOCUMENT_TYPE,
    projection: `{name}`,
  })

  return (
    <PageLayout
      title="Presence"
      subtitle="Open this page in a second tab to see presence. Both tabs are you, as two separate sessions, which is what the Studio shows too."
    >
      {announcing ? <PresenceReporter documentId={reportedId} focusedField={focusedField} /> : null}

      <Card padding={3} radius={2} tone="transparent">
        <Flex align="flex-start" gap={3}>
          <Stack space={3} flex={1}>
            <Text size={1} weight="medium">
              {data?.name ?? 'Untitled'}
            </Text>
            <Code size={0} data-testid="presence-document-id">
              {documentId}
            </Code>
            <Flex align="center" gap={2}>
              <Text size={1} muted>
                Present in the
              </Text>
              <Select
                data-testid="presence-report-as"
                value={reportAs}
                onChange={(event) =>
                  setReportAs(event.currentTarget.value === 'draft' ? 'draft' : 'published')
                }
              >
                <option value="draft">draft</option>
                <option value="published">published document</option>
              </Select>
            </Flex>
            <Text size={1} muted data-testid="presence-reported-id">
              Reporting as {reportedId}
            </Text>
            <Text size={1} muted>
              {resource && 'projectId' in resource
                ? `Project ${resource.projectId} · dataset ${resource.dataset}`
                : null}
            </Text>
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

      <Stack space={2}>
        <Text size={1} muted>
          Opening the same document in a Studio checks that presence works between the two: they
          share one room per project and dataset, so each should see the other. The link assumes
          that Studio serves the project and dataset above.
        </Text>
        <Text size={1} muted>
          The Studio compares published ids in its navbar and document lists, but its field
          indicators compare the exact id it is editing, which while editing is the draft. So
          reporting the published document appears in the Studio at document level yet never lights
          up a field. That is what the selector above is for.
        </Text>
        <Text size={1} muted>
          Defaults to the most recently created {DOCUMENT_TYPE} document. Add ?documentId=&lt;id&gt;
          to the URL to pick a different one, or ?studio=&lt;baseUrl&gt; to point the link at
          another Studio.
        </Text>
      </Stack>

      <Card padding={3} radius={2} tone="transparent">
        <Flex align="flex-start" gap={3}>
          <Checkbox
            id="presence-announcing"
            data-testid="presence-announcing"
            checked={announcing}
            onChange={(event) => setAnnouncing(event.currentTarget.checked)}
          />
          <Stack space={2} flex={1}>
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

      <Stack space={3}>
        <Text size={1} weight="semibold">
          Others in this document
        </Text>
        <Card
          padding={3}
          radius={2}
          border
          data-testid="presence-document"
          data-count={presence.length}
        >
          {presence.length === 0 ? (
            <Text size={1} muted data-testid="presence-document-empty">
              Nobody else is here
            </Text>
          ) : (
            <Stack space={3}>
              {presence.map((participant) => (
                <Flex
                  key={participant.sessionId}
                  align="center"
                  gap={2}
                  data-testid="presence-document-participant"
                >
                  <Badge tone="primary">{participant.user.profile.displayName}</Badge>
                  {/* Plain text rather than `Code`, which renders as a block and
                      would stack the words vertically. */}
                  <Text size={1} muted>
                    {participant.path.length > 0
                      ? `in ${participant.path.join('.')}`
                      : 'at the document root'}
                  </Text>
                </Flex>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>

      <Stack space={3}>
        <Text size={1} weight="semibold">
          Fields
        </Text>
        <Text size={1} muted>
          Focus a field to report presence there. The other tab shows a badge beside it.
        </Text>
        {FIELDS.map((field) => (
          <Stack key={field.name} space={2}>
            <Flex align="center" gap={2}>
              <Text size={1} weight="medium">
                {field.label}
              </Text>
              <FieldPresence documentId={reportedId} path={[field.name]} testId={field.name} />
            </Flex>
            {'options' in field ? (
              <Select
                data-testid={`presence-input-${field.name}`}
                onFocus={() => setFocusedField(field.name)}
                onBlur={() => setFocusedField(undefined)}
              >
                <option value="">Focus to be present in {field.name}</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : (
              <TextInput
                data-testid={`presence-input-${field.name}`}
                placeholder={`Focus to be present in ${field.name}`}
                onFocus={() => setFocusedField(field.name)}
                onBlur={() => setFocusedField(undefined)}
              />
            )}
          </Stack>
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

  if (!documentId) {
    return (
      <PageLayout title="Presence" subtitle="Nothing to be present in">
        <Card padding={3} radius={2} tone="caution">
          <Text size={1} data-testid="presence-no-documents">
            {documentIdParam
              ? `No ${DOCUMENT_TYPE} document with id ${documentIdParam}.`
              : `No ${DOCUMENT_TYPE} documents in this dataset.`}
          </Text>
        </Card>
      </PageLayout>
    )
  }

  return <PresenceDemo documentId={documentId} />
}
