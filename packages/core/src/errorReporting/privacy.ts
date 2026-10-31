import {type BrowserOptions, type ErrorEvent} from './sentryTypes'

/**
 * Key fragments Sentry denies when `sendDefaultPii` is left unset. The Sentry v11 migration guide
 * uses the same list for headers and query params.
 */
const PII_KEY_DENYLIST = ['forwarded', '-ip', 'remote-', 'via', '-user']

/**
 * Turns off every automatic data category that can carry user or customer data. Matches the
 * posture Sanity Studio uses for its own Sentry client.
 *
 * `userInfo: false` also stops Relay from inferring the client IP.
 */
export const sdkSentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: {deny: PII_KEY_DENYLIST},
    response: {deny: PII_KEY_DENYLIST},
  },
  httpBodies: [],
  urlQueryParams: {deny: PII_KEY_DENYLIST},
  genAI: {inputs: false, outputs: false},
  databaseQueryData: false,
  graphQL: {document: false, variables: false},
  queues: false,
} satisfies NonNullable<BrowserOptions['dataCollection']>

const KEPT_TAGS = ['handled', 'errorBoundary']

/**
 * Sentry `beforeSend` hook that rebuilds the event from an allowlist of fields. Sentry merges
 * the global and isolation scopes into every event, and when the host page runs the same Sentry
 * version those scopes are the host's: its tags, extras, breadcrumbs, and contexts would be
 * sent along with the SDK's error. Anything not listed here is dropped, and the zeroed IP stops
 * Sentry from filling one in from the connection. Exception messages and stack frames are kept
 * as they are.
 */
export function beforeSend(event: ErrorEvent): ErrorEvent {
  const tags: NonNullable<ErrorEvent['tags']> = {}
  for (const key of KEPT_TAGS) {
    const value = event.tags?.[key]
    if (value !== undefined) tags[key] = value
  }

  const react = event.contexts?.['react']

  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    environment: event.environment,
    message: event.message,
    exception: event.exception,
    sdk: event.sdk,
    tags,
    contexts: react ? {react} : undefined,
    user: {ip_address: '0.0.0.0'},
  }
}
