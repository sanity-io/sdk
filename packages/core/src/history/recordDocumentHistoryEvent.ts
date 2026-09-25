import {
  type CanvasResource,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {catchError, defer, EMPTY, filter, first, from, map, type Observable} from 'rxjs'

import {getNodeState} from '../comlink/node/getNodeState'
import {type DocumentHandle} from '../config/sanityConfig'
import {isDashboardEnvironment, requireDashboardMessageBus} from '../dashboard/messageBus/store'
import {type SanityInstance} from '../store/createSanityInstance'

/**
 * Input for {@link recordDocumentHistoryEvent}.
 *
 * @internal
 */
export interface RecordDocumentHistoryEventInput extends DocumentHandle {
  eventType: 'viewed' | 'edited' | 'created' | 'deleted'
  resourceType: StudioResource['type'] | MediaResource['type'] | CanvasResource['type']
  /**
   * The resource the document lives in. Optional for studios over Comlink, where the iframe
   * host fills it from context; required under the message bus.
   */
  resourceId?: string
  schemaName?: string
}

/**
 * Records a document interaction in the Dashboard's history, over the message bus when a
 * dashboard host has installed one and over Comlink otherwise.
 *
 * @remarks
 * Emits once the event is sent, then completes. Over Comlink it waits for the node to connect.
 * Under the message bus it reads the host's capabilities, waiting for the default query timeout,
 * and completes without emitting when the host does not provide `history` or the read fails.
 * @internal
 */
export function recordDocumentHistoryEvent(
  instance: SanityInstance,
  input: RecordDocumentHistoryEventInput,
): Observable<void> {
  return defer(() =>
    isDashboardEnvironment() ? emitBusEvent(instance, input) : postComlinkEvent(instance, input),
  )
}

function postComlinkEvent(
  instance: SanityInstance,
  {
    eventType,
    documentId,
    documentType,
    resourceId,
    resourceType,
    schemaName,
  }: RecordDocumentHistoryEventInput,
): Observable<void> {
  return getNodeState(instance, {name: SDK_NODE_NAME, connectTo: SDK_CHANNEL_NAME}).observable.pipe(
    first(Boolean),
    map(({node}) =>
      // @ts-expect-error -- getOrCreateNode should be refactored to take type arguments
      node.post('dashboard/v1/events/history', {
        eventType,
        document: {
          id: documentId,
          type: documentType,
          resource: {id: resourceId!, type: resourceType, schemaName},
        },
      }),
    ),
  )
}

function emitBusEvent(
  instance: SanityInstance,
  {
    eventType,
    documentId,
    documentType,
    resourceId,
    resourceType,
    schemaName,
  }: RecordDocumentHistoryEventInput,
): Observable<void> {
  const bus = requireDashboardMessageBus(instance, 'record document history')
  // A studio is addressed by its dataset resource; the workspace name rides along in `schemaName`.
  const type = resourceType === 'studio' ? 'dataset' : resourceType

  return from(bus.query('applications.capabilities')).pipe(
    catchError((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to read dashboard capabilities, dropping history event', error)
      return EMPTY
    }),
    filter((capabilities) => !!capabilities.history),
    map(() => {
      bus.emit('applications.activity', {
        kind: 'document',
        eventType,
        document: {
          id: documentId,
          type: documentType,
          resource: {id: resourceId!, type, schemaName},
        },
      })
    }),
  )
}
