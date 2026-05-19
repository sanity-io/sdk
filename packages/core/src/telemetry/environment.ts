/**
 * Telemetry environment classification.
 *
 * - `'development'` — the SDK is running on the local developer's machine
 *   (`localhost` / `127.0.0.1` in the browser, or `NODE_ENV=development`
 *   in Node). These are the original dev-only telemetry sessions.
 *
 * - `'production'` — the SDK is running on a production Sanity-controlled
 *   domain (Studio deployments on `*.sanity.studio`, the dashboard on
 *   `*.sanity.io`) where end users are authenticated Sanity users with
 *   Populus consent records. Production telemetry is gated to this
 *   allowlist; SDK apps deployed to customer-controlled domains do not
 *   emit telemetry. Staging (`*.sanity.work`) and preview
 *   (`*.sanity.dev`) hosts are deliberately excluded.
 *
 * @internal
 */
export type TelemetryEnvironment = 'development' | 'production'

/**
 * Hostname suffixes that count as Sanity-controlled for the purposes of
 * production telemetry. A user reaching one of these hosts in the
 * browser is authenticated against Sanity and has a Populus consent
 * record, so we apply the same telemetry rules as the Studio's
 * `telemetry-sink`.
 *
 * The leading `.` is required: it ensures suffix matches hit a real
 * subdomain boundary, so apex matches (`sanity.io`, `sanity.studio`)
 * and lookalikes (`evilsanity.studio`) are excluded. Only production
 * hosts are listed; staging (`*.sanity.work`) and preview
 * (`*.sanity.dev`) hosts are excluded by omission.
 *
 * @internal
 */
const SANITY_CONTROLLED_HOST_SUFFIXES = ['.sanity.studio', '.sanity.io'] as const

function getBrowserHostname(win: Window): string | null {
  const hostname = win.location?.hostname
  return typeof hostname === 'string' && hostname.length > 0 ? hostname.toLowerCase() : null
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function isSanityControlledHostname(hostname: string): boolean {
  return SANITY_CONTROLLED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
}

/**
 * Returns the telemetry environment for the current runtime, or `null`
 * when telemetry should not run at all.
 *
 * Browser:
 * - `localhost` / `127.0.0.1` → `'development'`
 * - host matches the Sanity-controlled allowlist → `'production'`
 * - anything else (customer domains, unknown contexts) → `null`
 *
 * Node (scripts, SSR, tests):
 * - `NODE_ENV=development` → `'development'`
 * - otherwise → `null`. Production-side server runtimes don't carry the
 *   browser-authenticated user/consent assumption, so we don't enable
 *   them under the production gate.
 *
 * Bracket-notation `process.env['NODE_ENV']` is used to avoid bundler
 * dead-code replacement.
 *
 * @internal
 */
export function getTelemetryEnvironment(): TelemetryEnvironment | null {
  if (typeof window !== 'undefined') {
    const hostname = getBrowserHostname(window)
    if (!hostname) return null
    if (isLocalHostname(hostname)) return 'development'
    if (isSanityControlledHostname(hostname)) return 'production'
    return null
  }

  if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'development') {
    return 'development'
  }
  return null
}

/**
 * Convenience predicate for "telemetry can run in this environment".
 *
 * @internal
 */
export function isTelemetryEnabled(): boolean {
  return getTelemetryEnvironment() !== null
}
