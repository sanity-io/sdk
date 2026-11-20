const DEFAULT_REQUEST_TAG_PREFIX = 'sanity.sdk'

/**
 * Strips leading/trailing dots and an optional leading `sanity.sdk` prefix so
 * configuring either `'workbench'` or `'sanity.sdk.workbench'` appends cleanly
 * under `sanity.sdk`.
 */
function normalizeConfiguredPrefix(value: string): string {
  const trimmed = value.replace(/^\.+|\.+$/g, '')
  if (trimmed === DEFAULT_REQUEST_TAG_PREFIX) return ''
  if (trimmed.startsWith(`${DEFAULT_REQUEST_TAG_PREFIX}.`)) {
    return trimmed.slice(DEFAULT_REQUEST_TAG_PREFIX.length + 1).replace(/^\.+/, '')
  }
  return trimmed
}

/**
 * Resolves the effective `requestTagPrefix` for an SDK client by appending any
 * configured prefix segment and optional subsystem segments after `sanity.sdk`.
 *
 * @internal
 */
export function resolveRequestTagPrefix(configuredPrefix?: string, ...segments: string[]): string {
  const parts = [DEFAULT_REQUEST_TAG_PREFIX]

  if (configuredPrefix) {
    const normalized = normalizeConfiguredPrefix(configuredPrefix)
    if (normalized) parts.push(normalized)
  }

  for (const segment of segments) {
    const trimmed = segment.replace(/^\.+|\.+$/g, '')
    if (trimmed) parts.push(trimmed)
  }

  return parts.join('.')
}
