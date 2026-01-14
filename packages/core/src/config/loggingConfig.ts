/**
 * Public API for configuring SDK logging
 *
 * @module loggingConfig
 */

import {configureLogging as _configureLogging, type LoggerConfig} from '../utils/logger'

/**
 * Configure logging for the Sanity SDK
 *
 * This function allows you to control what logs are output by the SDK,
 * making it easier to debug issues in development or production.
 *
 * @remarks
 * **Zero-Config via Environment Variable (Recommended):**
 *
 * The SDK automatically reads the `DEBUG` environment variable, making it
 * easy to enable logging without code changes:
 *
 * ```bash
 * # Enable all SDK logging at debug level
 * DEBUG=sanity:* npm start
 *
 * # Enable specific namespaces
 * DEBUG=sanity:auth,sanity:document npm start
 *
 * # Enable trace level for all namespaces
 * DEBUG=sanity:trace:* npm start
 *
 * # Enable internal/maintainer logs
 * DEBUG=sanity:*:internal npm start
 * ```
 *
 * This matches the pattern used by Sanity CLI and Studio, making it familiar
 * and easy for support teams to help troubleshoot issues.
 *
 * **Programmatic Configuration (Advanced):**
 *
 * For more control (custom handlers, dynamic configuration), call this function
 * explicitly. Programmatic configuration overrides environment variables.
 *
 * **For Application Developers:**
 * Use `info`, `warn`, or `error` levels to see high-level SDK activity
 * without being overwhelmed by internal details.
 *
 * **For SDK Maintainers:**
 * Use `debug` or `trace` levels with `internal: true` to see detailed
 * information about store operations, RxJS streams, and state transitions.
 *
 * **Instance Context:**
 * Logs automatically include instance information (projectId, dataset, instanceId)
 * when available, making it easier to debug multi-instance scenarios:
 * ```
 * [INFO] [auth] [project:abc] [dataset:production] User logged in
 * ```
 *
 * **Available Namespaces:**
 * - `sdk` - SDK initialization, configuration, and lifecycle
 * - `auth` - Authentication and authorization (when instrumented in the future)
 * - And more as logging is added to modules
 *
 * @example Zero-config via environment variable (recommended for debugging)
 * ```bash
 * # Just set DEBUG and run your app - no code changes needed!
 * DEBUG=sanity:* npm start
 * ```
 *
 * @example Programmatic configuration (application developer)
 * ```ts
 * import {configureLogging} from '@sanity/sdk'
 *
 * // Log warnings and errors for auth and document operations
 * configureLogging({
 *   level: 'warn',
 *   namespaces: ['auth', 'document']
 * })
 * ```
 *
 * @example Programmatic configuration (SDK maintainer)
 * ```ts
 * import {configureLogging} from '@sanity/sdk'
 *
 * // Enable all logs including internal traces
 * configureLogging({
 *   level: 'trace',
 *   namespaces: ['*'],
 *   internal: true
 * })
 * ```
 *
 * @example Custom handler (for testing)
 * ```ts
 * import {configureLogging} from '@sanity/sdk'
 *
 * const logs: string[] = []
 * configureLogging({
 *   level: 'info',
 *   namespaces: ['*'],
 *   handler: {
 *     error: (msg) => logs.push(msg),
 *     warn: (msg) => logs.push(msg),
 *     info: (msg) => logs.push(msg),
 *     debug: (msg) => logs.push(msg),
 *     trace: (msg) => logs.push(msg),
 *   }
 * })
 * ```
 *
 * @public
 */
export function configureLogging(config: LoggerConfig): void {
  _configureLogging(config)

  // Always log configuration (bypasses namespace filtering)
  // This ensures users see the message regardless of which namespaces they enable
  const configLevel = config.level || 'warn'
  const shouldLog = ['info', 'debug', 'trace'].includes(configLevel) || configLevel === 'warn'

  if (shouldLog && config.handler?.info) {
    config.handler.info(`[${new Date().toISOString()}] [INFO] [sdk] Logging configured`, {
      level: configLevel,
      namespaces: config.namespaces || [],
      internal: config.internal || false,
      source: 'programmatic',
    })
  } else if (shouldLog) {
    // eslint-disable-next-line no-console
    console.info(`[${new Date().toISOString()}] [INFO] [sdk] Logging configured`, {
      level: configLevel,
      namespaces: config.namespaces || [],
      internal: config.internal || false,
      source: 'programmatic',
    })
  }
}

/**
 * Re-export types for public API
 * @public
 */
export type {
  InstanceContext,
  LogContext,
  Logger,
  LoggerConfig,
  LogLevel,
  LogNamespace,
} from '../utils/logger'
