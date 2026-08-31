import {type TopicName} from './topics'

/**
 * Message metadata. Reply routing is carried by the delivery mechanism, not the
 * envelope, so this is provenance only.
 * @public
 */
export interface OsMeta {
  appId: string
  timestamp: number
}

/**
 * One envelope flowing through a topic.
 * @public
 */
export interface Message<T> {
  type: TopicName
  payload: T
  meta: OsMeta
}

/**
 * What an event-topic handler receives: the envelope plus `reply` (routed back
 * to the awaiting caller) and `signal` (aborts when that caller stops waiting —
 * never on a fire-and-forget emit).
 * @public
 */
export interface OsMessage<T, R = never> extends Message<T> {
  reply(value: R): void
  readonly signal: AbortSignal
}

export function createMeta(appId: string): OsMeta {
  return {appId, timestamp: Date.now()}
}
