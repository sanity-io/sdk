import {type SanityClient} from '@sanity/client'
import {
  type ConsentStatus,
  createBatchedStore,
  type SessionId,
  type TelemetryEvent,
  type TelemetryLogger,
  type TelemetryStore,
} from '@sanity/telemetry'

import {createLogger} from '../utils/logger'
import {CORE_SDK_VERSION} from '../version'
import {
  SDKDevError,
  SDKDevSessionEnded,
  SDKDevSessionStarted,
  SDKHookMounted,
} from './__telemetry__/sdk.telemetry'

const FLUSH_INTERVAL_MS = 30_000
const CONSENT_TAG = 'telemetry-consent.sdk'
const BATCH_TAG = 'telemetry.batch'

const log = createLogger('telemetry')

/**
 * Manages dev-mode telemetry for a single SDK instance.
 *
 * Wraps `@sanity/telemetry`'s batched store with SDK-specific concerns:
 * consent caching, session lifecycle events, and hook usage tracking.
 *
 * @internal
 */
export interface TelemetryManager {
  /**
   * Eagerly resolve and cache the user's consent status.
   * Returns true only when the user has explicitly opted in (`granted`).
   * Call this before logging any events to avoid buffering events that
   * will be dropped on the first flush.
   */
  checkConsent(): Promise<boolean>

  /** Log a "SDK Dev Session Started" event */
  logSessionStarted(data: {projectId: string; perspective: string; authMethod: string}): void

  /** Log a "SDK Hook First Used" event (deduplicated per hook name) */
  logHookFirstUsed(hookName: string): void

  /** Log a "SDK Dev Error" event */
  logDevError(errorType: string, hookName: string): void

  /** Log a "SDK Dev Session Ended" event and tear down the store */
  endSession(): void

  /** Tear down the store without logging a session-end event */
  dispose(): void

  /** The set of hook names used during this session */
  readonly hooksUsed: ReadonlySet<string>
}

interface TelemetryManagerOptions {
  sessionId: string
  getClient: () => SanityClient
  projectId: string
}

/**
 * Creates a telemetry manager for a single SDK instance session.
 *
 * The manager initializes a `createBatchedStore` from `@sanity/telemetry`,
 * caches the consent check for the lifetime of the session, and provides
 * typed methods for each SDK telemetry event.
 *
 * @internal
 */
export function createTelemetryManager(options: TelemetryManagerOptions): TelemetryManager {
  const {sessionId, getClient, projectId} = options
  const startedAt = Date.now()
  const emittedHooks = new Set<string>()

  let cachedConsent: {status: ConsentStatus} | null = null

  const resolveConsent = async (): Promise<{status: ConsentStatus}> => {
    if (cachedConsent) return cachedConsent
    try {
      const client = getClient()
      const result = await client.request<{status: ConsentStatus}>({
        uri: '/intake/telemetry-status',
        tag: CONSENT_TAG,
      })
      cachedConsent = result
    } catch {
      cachedConsent = {status: 'undetermined'}
    }
    return cachedConsent
  }

  const enrichBatch = (batch: TelemetryEvent[]) =>
    batch.map((event) => ({
      ...event,
      context: {
        version: CORE_SDK_VERSION,
        environment: 'development' as const,
        origin: typeof window !== 'undefined' ? window.location.origin : 'node',
      },
    }))

  const sendEvents = async (batch: TelemetryEvent[]): Promise<unknown> => {
    const client = getClient()
    log.debug('sending event batch', {batchSize: batch.length})
    return client.request({
      uri: '/intake/batch',
      method: 'POST',
      body: {projectId, batch: enrichBatch(batch)},
      tag: BATCH_TAG,
    })
  }

  const store: TelemetryStore<Record<string, unknown>> = createBatchedStore(
    sessionId as SessionId,
    {
      flushInterval: FLUSH_INTERVAL_MS,
      resolveConsent,
      sendEvents,
    },
  )

  const logger: TelemetryLogger<Record<string, unknown>> = store.logger

  return {
    async checkConsent() {
      const {status} = await resolveConsent()
      return status === 'granted'
    },

    logSessionStarted(data) {
      log.debug('event: SDK Dev Session Started', {
        projectId: data.projectId,
        perspective: data.perspective,
        authMethod: data.authMethod,
        version: CORE_SDK_VERSION,
      })
      logger.log(SDKDevSessionStarted, {
        version: CORE_SDK_VERSION,
        ...data,
      })
    },

    logHookFirstUsed(hookName: string) {
      if (emittedHooks.has(hookName)) return
      emittedHooks.add(hookName)
      log.debug('event: SDK Hook Mounted', {hookName})
      logger.log(SDKHookMounted, {hookName})
    },

    logDevError(errorType: string, hookName: string) {
      log.debug('event: SDK Dev Error', {errorType, hookName})
      logger.log(SDKDevError, {errorType, hookName})
    },

    endSession() {
      const durationSeconds = Math.round((Date.now() - startedAt) / 1000)
      log.debug('event: SDK Dev Session Ended', {
        durationSeconds,
        hooksUsed: [...emittedHooks],
      })
      logger.log(SDKDevSessionEnded, {
        durationSeconds,
        hooksUsed: [...emittedHooks],
      })

      store.flush().catch(() => {
        // Best-effort flush on dispose; swallow errors
      })
      store.end()
    },

    dispose() {
      store.end()
    },

    get hooksUsed(): ReadonlySet<string> {
      return emittedHooks
    },
  }
}
