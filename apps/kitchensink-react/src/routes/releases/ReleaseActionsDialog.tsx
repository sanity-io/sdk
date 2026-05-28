import {
  archiveRelease,
  createRelease,
  deleteRelease,
  editRelease,
  publishRelease,
  type ReleaseDocument,
  type ReleaseHandle,
  scheduleRelease,
  unarchiveRelease,
  unscheduleRelease,
  useApplyReleaseActions,
  useResource,
} from '@sanity/sdk-react'
import {Box, Button, Card, Dialog, Flex, Select, Stack, Text, TextArea, TextInput} from '@sanity/ui'
import {useState} from 'react'

const RELEASE_TYPES: ReleaseDocument['metadata']['releaseType'][] = [
  'asap',
  'scheduled',
  'undecided',
]

type Mode = 'create' | 'edit'

interface ReleaseActionsDialogProps {
  mode: Mode
  release?: ReleaseDocument
  onClose: () => void
  onCreated?: (releaseId: string) => void
  /**
   * Called after publish / archive / delete succeed — the release will no
   * longer be in `useActiveReleases`, so consumers should clear any
   * perspective pointing at it.
   */
  onLeftActive?: () => void
}

function generateReleaseId(): string {
  // Match the studio's short ID style: `r<7 hex chars>`.
  return `r${crypto.randomUUID().replace(/-/g, '').slice(0, 7)}`
}

function toDatetimeLocal(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // datetime-local expects YYYY-MM-DDTHH:mm (no seconds, no timezone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(value: string): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function ReleaseActionsDialog({
  mode,
  release,
  onClose,
  onCreated,
  onLeftActive,
}: ReleaseActionsDialogProps): React.ReactNode {
  const applyRelease = useApplyReleaseActions()
  const resource = useResource()

  const [releaseId, setReleaseId] = useState(() =>
    mode === 'edit' && release ? release.name : generateReleaseId(),
  )
  const [title, setTitle] = useState(release?.metadata?.title ?? '')
  const [description, setDescription] = useState(release?.metadata?.description ?? '')
  const [releaseType, setReleaseType] = useState<ReleaseDocument['metadata']['releaseType']>(
    release?.metadata?.releaseType ?? 'undecided',
  )
  const [intendedPublishAt, setIntendedPublishAt] = useState(
    toDatetimeLocal(release?.metadata?.intendedPublishAt),
  )
  const [status, setStatus] = useState<{tone: 'positive' | 'critical'; message: string} | null>(
    null,
  )
  const [busy, setBusy] = useState(false)

  const handle: ReleaseHandle = {
    releaseId,
    resource,
  }

  const metadataFromForm = (): ReleaseDocument['metadata'] => ({
    ...(title && {title}),
    ...(description && {description}),
    releaseType,
    ...(fromDatetimeLocal(intendedPublishAt) && {
      intendedPublishAt: fromDatetimeLocal(intendedPublishAt),
    }),
  })

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true)
    setStatus(null)
    try {
      await fn()
      setStatus({tone: 'positive', message: `${label} succeeded.`})
    } catch (err) {
      setStatus({
        tone: 'critical',
        message: `${label} failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async () => {
    let created = false
    await run('Create release', async () => {
      await applyRelease(createRelease(handle, metadataFromForm()))
      created = true
    })
    if (created) onCreated?.(releaseId)
  }

  const handleEdit = () =>
    run('Edit release', async () => {
      const meta = metadataFromForm()
      await applyRelease(
        editRelease(handle, {
          set: {
            ...(meta.title !== undefined && {'metadata.title': meta.title}),
            ...(meta.description !== undefined && {'metadata.description': meta.description}),
            'metadata.releaseType': meta.releaseType,
            ...(meta.intendedPublishAt && {'metadata.intendedPublishAt': meta.intendedPublishAt}),
          },
          ...(!meta.intendedPublishAt && {unset: ['metadata.intendedPublishAt']}),
        }),
      )
    })

  const handlePublish = () =>
    run('Publish release', async () => {
      await applyRelease(publishRelease(handle))
      onLeftActive?.()
    })

  const handleSchedule = () =>
    run('Schedule release', () => {
      const publishAt = fromDatetimeLocal(intendedPublishAt)
      if (!publishAt) {
        throw new Error('Set "Intended publish at" before scheduling.')
      }
      return applyRelease(scheduleRelease(handle, publishAt))
    })

  const handleUnschedule = () =>
    run('Unschedule release', () => applyRelease(unscheduleRelease(handle)))
  const handleArchive = () =>
    run('Archive release', async () => {
      await applyRelease(archiveRelease(handle))
      onLeftActive?.()
    })
  const handleUnarchive = () =>
    run('Unarchive release', () => applyRelease(unarchiveRelease(handle)))
  const handleDelete = async () => {
    let deleted = false
    await run('Delete release', async () => {
      await applyRelease(deleteRelease(handle))
      deleted = true
    })
    if (deleted) {
      onLeftActive?.()
      onClose()
    }
  }

  const state = release?.state
  const isEdit = mode === 'edit'
  const canEditMetadata = !isEdit || state === 'active'

  return (
    <Dialog
      id="release-actions-dialog"
      header={
        isEdit ? `Edit release: ${release?.metadata?.title ?? release?.name}` : 'Create release'
      }
      onClose={onClose}
      width={1}
    >
      <Box padding={4}>
        <Stack space={4}>
          {/* Metadata form */}
          <Card padding={3} radius={2} shadow={1}>
            <Stack space={3}>
              <Text size={1} weight="semibold">
                Metadata
              </Text>
              <Box>
                <Stack space={2}>
                  <Text size={0} muted>
                    Release ID
                  </Text>
                  <TextInput
                    value={releaseId}
                    onChange={(e) => setReleaseId(e.currentTarget.value)}
                    readOnly={isEdit}
                    fontSize={1}
                    data-testid="release-id-input"
                  />
                </Stack>
              </Box>
              <Box>
                <Stack space={2}>
                  <Text size={0} muted>
                    Title
                  </Text>
                  <TextInput
                    value={title}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                    disabled={!canEditMetadata}
                    fontSize={1}
                    data-testid="release-title-input"
                  />
                </Stack>
              </Box>
              <Box>
                <Stack space={2}>
                  <Text size={0} muted>
                    Description
                  </Text>
                  <TextArea
                    value={description}
                    onChange={(e) => setDescription(e.currentTarget.value)}
                    disabled={!canEditMetadata}
                    fontSize={1}
                    rows={3}
                    data-testid="release-description-input"
                  />
                </Stack>
              </Box>
              <Flex gap={3}>
                <Box flex={1}>
                  <Stack space={2}>
                    <Text size={0} muted>
                      Release type
                    </Text>
                    <Select
                      value={releaseType}
                      onChange={(e) =>
                        setReleaseType(
                          e.currentTarget.value as ReleaseDocument['metadata']['releaseType'],
                        )
                      }
                      disabled={!canEditMetadata}
                      fontSize={1}
                      data-testid="release-type-select"
                    >
                      {RELEASE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                  </Stack>
                </Box>
                <Box flex={1}>
                  <Stack space={2}>
                    <Text size={0} muted>
                      Intended publish at
                    </Text>
                    <TextInput
                      type="datetime-local"
                      value={intendedPublishAt}
                      onChange={(e) => setIntendedPublishAt(e.currentTarget.value)}
                      disabled={!canEditMetadata}
                      fontSize={1}
                      data-testid="release-intended-publish-at-input"
                    />
                  </Stack>
                </Box>
              </Flex>
            </Stack>
          </Card>

          {/* Primary action */}
          <Flex gap={2} wrap="wrap">
            {!isEdit && (
              <Button
                text="Create release"
                tone="positive"
                onClick={handleCreate}
                disabled={busy || !releaseId}
                data-testid="release-create-submit"
              />
            )}
            {isEdit && (
              <Button
                text="Save metadata"
                tone="primary"
                onClick={handleEdit}
                disabled={busy || !canEditMetadata}
                data-testid="release-edit-submit"
              />
            )}
          </Flex>

          {/* Lifecycle actions (edit mode only) */}
          {isEdit && release && (
            <Card padding={3} radius={2} shadow={1}>
              <Stack space={3}>
                <Text size={1} weight="semibold" data-testid="release-state-display">
                  Lifecycle actions — current state: {state}
                </Text>
                <Flex gap={2} wrap="wrap">
                  <Button
                    text="Publish"
                    tone="positive"
                    onClick={handlePublish}
                    disabled={busy || state !== 'active'}
                    data-testid="release-publish-action"
                  />
                  <Button
                    text="Schedule"
                    onClick={handleSchedule}
                    disabled={busy || state !== 'active'}
                    data-testid="release-schedule-action"
                  />
                  <Button
                    text="Unschedule"
                    onClick={handleUnschedule}
                    disabled={busy || state !== 'scheduled'}
                    data-testid="release-unschedule-action"
                  />
                  <Button
                    text="Archive"
                    onClick={handleArchive}
                    disabled={busy || state !== 'active'}
                    data-testid="release-archive-action"
                  />
                  <Button
                    text="Unarchive"
                    onClick={handleUnarchive}
                    disabled={busy || state !== 'archived'}
                    data-testid="release-unarchive-action"
                  />
                  <Button
                    text="Delete"
                    tone="critical"
                    onClick={handleDelete}
                    disabled={busy || (state !== 'archived' && state !== 'published')}
                    data-testid="release-delete-action"
                  />
                </Flex>
                <Text size={0} muted>
                  Delete is only allowed for archived/published releases. Archive an active release
                  first.
                </Text>
              </Stack>
            </Card>
          )}

          {status && (
            <Card padding={3} radius={2} tone={status.tone} data-testid="release-action-status">
              <Text size={1}>{status.message}</Text>
            </Card>
          )}
        </Stack>
      </Box>
    </Dialog>
  )
}
