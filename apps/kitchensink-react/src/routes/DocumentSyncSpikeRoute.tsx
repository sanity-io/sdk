import {makePatches, stringifyPatches} from '@sanity/diff-match-patch'
import {createDocumentSync, type DocumentSync, type ListenEvent} from '@sanity/document-sync'
import {useClient, useDocuments, useResource} from '@sanity/sdk-react'
import {type JSX, Suspense, useCallback, useEffect, useState} from 'react'
import {Box, Card, Spinner, Text, VStack} from 'ui5'

import {PageLayout} from '../components/PageLayout'

// Spike, not for merge: runs the @sanity/document-sync prototype engine against a real document,
// with the SDK's own client as its transport. The SDK document store is not involved.

const API_VERSION = 'v2025-02-19'

/** One transaction the engine sent, as the spike's transport saw it. */
interface SentTransaction {
  transactionId: string
  status: 'sending' | 'accepted' | 'failed' | 'confirmed'
  detail?: string
}

interface SpikeEngine {
  sync: DocumentSync
  sent: SentTransaction[]
  /** Edits the engine reported as dropped (rejected by the server, or applied as a no-op). */
  dropped: string[]
}

function useDocumentSync(documentId: string): SpikeEngine | null {
  // The app's resource gives the client its project and dataset.
  const resource = useResource()
  const client = useClient({apiVersion: API_VERSION, resource})
  const [engine, setEngine] = useState<SpikeEngine | null>(null)
  useEffect(() => {
    const sent: SentTransaction[] = []
    const track = (transactionId: string, update: Partial<SentTransaction>) => {
      const entry = sent.find((t) => t.transactionId === transactionId)
      // The listener echo can arrive before the HTTP response to the write, so a later
      // "accepted" must not undo "confirmed".
      if (entry && entry.status !== 'confirmed') Object.assign(entry, update)
    }
    const sync = createDocumentSync({
      documentId,
      transport: {
        fetch: (ids) => client.getDocuments(ids) as never,
        listen(ids, onEvent) {
          const subscription = client
            .listen(
              '*[_id in $ids]',
              {ids},
              {
                events: ['welcome', 'mutation', 'reconnect', 'reset', 'welcomeback'],
                effectFormat: 'mendoza',
                includeResult: false,
                enableResume: true,
                tag: 'document-sync-spike',
              },
            )
            .subscribe((event) => {
              const listenEvent = event as ListenEvent
              if (listenEvent.type === 'mutation')
                track(listenEvent.transactionId, {status: 'confirmed'})
              onEvent(listenEvent)
            })
          return () => subscription.unsubscribe()
        },
        submit: async ({transactionId, actions}) => {
          if (!sent.some((t) => t.transactionId === transactionId)) {
            sent.unshift({transactionId, status: 'sending'})
          }
          try {
            await client.action(actions as never, {transactionId, tag: 'document-sync-spike'})
            track(transactionId, {status: 'accepted'})
          } catch (error) {
            track(transactionId, {status: 'failed', detail: String(error)})
            throw error
          }
        },
      },
    })
    const dropped: string[] = []
    sync.onDropped((event) => {
      const what =
        event.reason === 'no-op'
          ? event.noOps.map((noOp) => `${noOp.op} ${noOp.path}: ${noOp.reason}`).join('; ')
          : String(event.error)
      dropped.unshift(`${event.transaction.transactionId.slice(0, 8)} ${event.reason}: ${what}`)
    })
    // oxlint-disable-next-line react/set-state-in-effect -- the engine opens a listener, so it is created in an effect and handed to render
    setEngine({sync, sent, dropped})
    return () => sync.dispose()
  }, [client, documentId])
  return engine
}

interface EngineView {
  remote: ReturnType<DocumentSync['remote']>
  local: ReturnType<DocumentSync['local']>
  sent: SentTransaction[]
  dropped: string[]
}

// The engine has no change subscription yet, so the spike copies its state into React state on an
// interval. Reading the mutable engine during render does not work here: the React Compiler caches
// those reads against the unchanged engine reference.
function useEngineView(engine: SpikeEngine | null): [EngineView | null, () => void] {
  const [view, setView] = useState<EngineView | null>(null)
  const refresh = useCallback(() => {
    if (!engine) return
    const {sync, sent, dropped} = engine
    setView({remote: sync.remote(), local: sync.local(), sent: [...sent], dropped: [...dropped]})
  }, [engine])
  useEffect(() => {
    const timer = setInterval(refresh, 200)
    return () => clearInterval(timer)
  }, [refresh])
  return [view, refresh]
}

function SpikeDocument({documentId}: {documentId: string}): JSX.Element {
  const engine = useDocumentSync(documentId)
  const [view, refresh] = useEngineView(engine)
  if (!engine || !view) return <Spinner />
  const {sync} = engine
  const {remote, local, sent, dropped} = view
  const confirmed = remote?.draft ?? remote?.published
  const localName = String(local?.['name'] ?? '')

  const onChange = (next: string) => {
    // A text edit goes out as a diff-match-patch, as the SDK's string inputs send it.
    // Diff against the engine's local view at the time of the change.
    const current = String(sync.local()?.['name'] ?? '')
    const patch = stringifyPatches(makePatches(current, next))
    sync.edit([{diffMatchPatch: {name: patch}}])
    refresh()
  }

  return (
    <VStack gap={3}>
      <Card density="compact">
        <VStack gap={2}>
          <label htmlFor="spike-name">
            <Text size={1} weight="semibold">
              name (local view: confirmed copy plus pending edits)
            </Text>
          </label>
          {remote ? (
            <input
              id="spike-name"
              value={localName}
              onChange={(event) => onChange(event.target.value)}
              style={{font: 'inherit', padding: 6}}
            />
          ) : (
            <Spinner />
          )}
        </VStack>
      </Card>
      <Card density="compact">
        <VStack gap={2}>
          <Text size={1} weight="semibold">
            Confirmed server copy (from Mendoza effects)
          </Text>
          <Text size={1}>name: {String(confirmed?.['name'] ?? '(none)')}</Text>
          <Text size={1}>_id: {confirmed?._id ?? '(none)'}</Text>
          <Text size={1}>_rev: {confirmed?._rev ?? '(none)'}</Text>
        </VStack>
      </Card>
      <Card density="compact">
        <VStack gap={2}>
          <Text size={1} weight="semibold">
            Document actions
          </Text>
          <Box>
            <button type="button" onClick={() => sync.publish()}>
              Publish
            </button>{' '}
            <button type="button" onClick={() => sync.discard()}>
              Discard draft
            </button>
          </Box>
          <Text size={1} weight="semibold">
            Dropped edits ({dropped.length})
          </Text>
          {dropped.slice(0, 5).map((line) => (
            <Text key={line} size={1}>
              {line}
            </Text>
          ))}
        </VStack>
      </Card>
      <Card density="compact">
        <VStack gap={2}>
          <Text size={1} weight="semibold">
            Transactions sent ({sent.filter((t) => t.status !== 'confirmed').length} not yet
            confirmed)
          </Text>
          {sent.slice(0, 8).map((t) => (
            <Text key={t.transactionId} size={1}>
              {t.transactionId.slice(0, 8)}: {t.status}
              {t.detail ? ` (${t.detail})` : ''}
            </Text>
          ))}
        </VStack>
      </Card>
    </VStack>
  )
}

function Picker(): JSX.Element {
  const {data} = useDocuments({documentType: 'author', batchSize: 20})
  const [documentId, setDocumentId] = useState<string | undefined>(data[0]?.documentId)
  return (
    <VStack gap={3}>
      <Box>
        <label htmlFor="spike-document">
          <Text size={1}>Author document </Text>
        </label>
        <select
          id="spike-document"
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
        >
          {data.map((doc) => (
            <option key={doc.documentId} value={doc.documentId}>
              {doc.documentId}
            </option>
          ))}
        </select>
      </Box>
      {documentId ? <SpikeDocument key={documentId} documentId={documentId} /> : null}
    </VStack>
  )
}

export function DocumentSyncSpikeRoute(): JSX.Element {
  return (
    <PageLayout
      title="Document sync spike"
      subtitle="The @sanity/document-sync prototype engine against a real document"
    >
      <Suspense fallback={<Spinner />}>
        <Picker />
      </Suspense>
    </PageLayout>
  )
}
