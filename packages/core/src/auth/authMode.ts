import {type SanityConfig} from '../config/sanityConfig'
import {DEFAULT_BASE} from './authConstants'

/**
 * The runtime auth mode determines which authentication strategy the SDK uses.
 *
 * - `studio`     — Running inside Sanity Studio. Token is discovered from
 *                  Studio's localStorage entry or via cookie auth.
 * - `oauth`      — Configured with `auth.oauth`. Authenticates via Sanity's
 *                  OAuth 2.0 authorization-code + PKCE flow.
 * - `dashboard`  — Running inside the Sanity Dashboard iframe. Token is
 *                  provided by the parent frame via Comlink.
 * - `standalone` — Running as an independent app. Token comes from
 *                  localStorage or the OAuth login flow.
 *
 * @internal
 */
type AuthMode = 'studio' | 'oauth' | 'dashboard' | 'standalone'

/**
 * Determines the auth mode from instance config and environment.
 *
 * Priority:
 * 1. `studio` config provided → `'studio'`
 * 2. `auth.oauth` config provided → `'oauth'` (explicit config wins over
 *    environment detection)
 * 3. Dashboard context detected (`_context` URL param with content) → `'dashboard'`
 * 4. Otherwise → `'standalone'`
 *
 * @internal
 */
export function resolveAuthMode(config: SanityConfig, locationHref: string): AuthMode {
  if (isStudioConfig(config)) return 'studio'
  if (config.auth?.oauth) return 'oauth'
  if (detectDashboardContext(locationHref)) return 'dashboard'
  return 'standalone'
}

/**
 * Returns `true` when the config indicates the SDK is running inside a Studio.
 *
 * @internal
 */
export function isStudioConfig(config: SanityConfig): boolean {
  return !!config.studio
}

/**
 * Checks whether the given location href contains a `_context` URL parameter
 * with a non-empty JSON object, indicating the SDK is running inside the
 * Sanity Dashboard.
 *
 * @internal
 */
function detectDashboardContext(locationHref: string): boolean {
  try {
    const parsedUrl = new URL(locationHref, DEFAULT_BASE)
    const contextParam = parsedUrl.searchParams.get('_context')
    if (!contextParam) return false

    const parsed: unknown = JSON.parse(contextParam)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed as Record<string, unknown>).length > 0
    )
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse dashboard context from initial location:', err)
    return false
  }
}
