/**
 * Public API for configuring SDK logging
 *
 * @module loggingConfig
 */

import {
  configureLogging as _configureLogging,
  createLogger,
  type LoggerConfig,
} from '../utils/logger'

/**
 * Configure logging for the Sanity SDK
 *
 * This function allows you to control what logs are output by the SDK,
 * making it easier to debug issues in development or production.
 *
 * @remarks
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
 * @example Basic usage (application developer)
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
 * @example Advanced usage (SDK maintainer)
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
 * @example Enable via environment variable
 * ```ts
 * // In your app initialization
 * if (process.env.DEBUG === 'sanity:*') {
 *   configureLogging({
 *     level: 'debug',
 *     namespaces: ['*']
 *   })
 * }
 * ```
 *
 * @public
 */
export function configureLogging(config: LoggerConfig): void {
  _configureLogging(config)

  // Log that logging has been configured
  const sdkLogger = createLogger('sdk')
  sdkLogger.info('Logging configured', {
    level: config.level || 'warn',
    namespaces: config.namespaces || [],
    internal: config.internal || false,
  })
}

/**
 * Re-export types for public API
 * @public
 */
export type {LoggerConfig, LogLevel} from '../utils/logger'
